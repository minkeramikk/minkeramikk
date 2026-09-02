"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrder } from "@/lib/orders/admin-orders.server";
import { orderDiscount } from "@/lib/orders/admin-orders";
import { sendCustomMessage, sendStatusEmail } from "@/lib/orders/email";
import { recordOrderEvent } from "@/lib/orders/order-events.server";
import { fetchStoredCustomerPdf } from "@/lib/orders/customer-pdf.server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { EmailOutcome } from "@/lib/orders/order-events";
import { canEmail } from "@/lib/orders/status-email";
import { ORDER_STATUSES } from "@/lib/orders/order-status";

/**
 * Order mutations (F07 + R4-ORDERS/ADR 0021). Authenticated only: the
 * cookie-session client goes through RLS (orders "authenticated update", 0002),
 * so anon can't reach these effects; getAdminUser() adds the allowlist check
 * (defense in depth, same as lab-pdf-actions). `updated_at` is bumped by the
 * `orders_set_updated_at` trigger.
 */

/** Shared result shape used with React's useActionState. */
export type ActionResult = { error?: string; notice?: string };

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ORDER_STATUSES),
  /** Explicit admin decision, taken in the confirm dialog next to the preview. */
  sendEmail: z.boolean(),
  /** Optional tracking typed in the dialog when moving to shipped. */
  trackingCode: z.string().trim().max(120).optional(),
  /** Explicit acknowledgement of shipping without a tracking code. */
  ackNoTracking: z.boolean(),
});

/**
 * Status transition. Every transition is accepted (cancelled is reachable from
 * anywhere and the shop must be able to walk a state back); the only guard is
 * the tracking one on `shipped`. The email is a SEPARATE, opt-in effect and can
 * never fail the transition — the status is already persisted.
 */
export async function updateOrderStatus(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    sendEmail: formData.get("sendEmail") === "on",
    trackingCode: (formData.get("trackingCode") as string | null) ?? undefined,
    ackNoTracking: formData.get("ackNoTracking") === "on",
  });
  if (!parsed.success) return { error: "Invalid status value." };
  const { id, status, sendEmail, trackingCode, ackNoTracking } = parsed.data;

  const order = await getOrder(id);
  if (!order) return { error: "Order not found." };

  const tracking = trackingCode || order.trackingCode || null;
  if (status === "shipped" && !tracking && !ackNoTracking) {
    return { error: "Add a tracking code, or confirm shipping without one." };
  }

  // ADR 0022 / D3 — «Alessio ratifica alla conferma»: confirming an order IS the
  // ratification. Guarded three ways: only on `confirmed`, only once, and only
  // when there is something to ratify (an order at full price gets no
  // timestamp — it would be noise, not information). Only ever SET, never
  // cleared here: an admin who walks a status back keeps the ratification they
  // gave. Undo is the explicit toggle (toggleDiscountRatified).
  const ratifies =
    status === "confirmed" &&
    !order.discountRatifiedAt &&
    orderDiscount(order.items).amountCents > 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({
      status,
      ...(trackingCode ? { tracking_code: trackingCode } : {}),
      ...(ratifies ? { discount_ratified_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Failed to update status. Please try again." };

  let notice = `Status set to ${status}.`;
  // R4-ORDERS-PLUS: three values, not two. `skipped` covers "the admin
  // unticked it", "this status does not mail at all" (EMAIL_STATUSES lost
  // `confirmed` in R4-MAIL-JOURNEY) and "sendStatusEmail had nothing to send".
  let email: EmailOutcome = "skipped";
  if (sendEmail && canEmail(status)) {
    try {
      const sent = await sendStatusEmail({
        status,
        code: order.code,
        customerName: order.customerName,
        customerEmail: order.email,
        locale: order.locale === "en" ? "en" : "no",
        trackingCode: tracking,
        paidAt: order.paidAt,
      });
      // false = the status does not notify: not a failure, nothing to send.
      if (sent) {
        email = `sent:${order.email}`;
        notice += ` Email sent to ${order.email}.`;
      }
    } catch (e) {
      email = "failed";
      console.error(`order ${order.code}: status saved but email failed`, e);
      notice += " The status was saved but the email could not be sent.";
    }
  }

  // The log. `order.status` was read BEFORE the update, so `from` is the real
  // one. Never throws (order-events.server.ts): the status is already saved.
  await recordOrderEvent(id, "status_changed", { from: order.status, to: status, email });
  // "dialog or form" (card §B): a tracking code typed in the confirm dialog is
  // a tracking save like any other, and belongs in the register the same way.
  if (trackingCode) await recordOrderEvent(id, "tracking_set", { code: trackingCode });

  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin");
  return { notice };
}

const messageSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(1, { error: "Write a subject." }).max(200),
  body: z.string().trim().min(1, { error: "Write a message." }).max(5000),
  /** R4-PDF-CLIENTE riuso ④: allega il riepilogo già archiviato. */
  attachSummary: z.boolean(),
});

/**
 * R4-ORDERS-PLUS voce A — the free-text message to the customer, from inside
 * the order. Replaces the `mailto:` link, so what the admin sees in the box is
 * exactly what leaves: same branded shell, same sender, same transport as every
 * other customer mail.
 *
 * SYNCHRONOUS on purpose (card §B, note 2): Alessio can wait a second, and the
 * activity log can only say "sent" if somebody actually waited for the send.
 * On failure nothing is logged — nothing was sent — and the admin is told right
 * here, which is the other half of why this mail is not deferred.
 */
export async function sendCustomerMessage(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  const parsed = messageSchema.safeParse({
    id: formData.get("id"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    attachSummary: formData.get("attachSummary") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  const { id, subject, body, attachSummary } = parsed.data;

  const order = await getOrder(id);
  if (!order) return { error: "Order not found." };

  // R4-PDF-CLIENTE riuso ④: il riepilogo si SCARICA, non si rigenera — la
  // generazione ha un punto solo, alla creazione dell'ordine. Un ordine
  // anteriore alla feature (o la cui generazione è fallita) non ha nulla da
  // allegare: la mail parte lo stesso, e il log lo dirà.
  const pdf = attachSummary ? await fetchStoredCustomerPdf(createServiceRoleClient(), id) : null;

  try {
    await sendCustomMessage({
      to: order.email,
      subject,
      body,
      customerName: order.customerName,
      pdf,
      code: order.code,
    });
  } catch (e) {
    console.error(`order ${order.code}: custom message failed`, e);
    return { error: "The message could not be sent. Nothing was logged." };
  }

  // L'esito VERO, non l'intenzione (principio del log di R4-ORDERS-PLUS).
  await recordOrderEvent(id, "custom_email_sent", {
    subject,
    to: order.email,
    ...(attachSummary ? { summary: pdf ? "attached" : "unavailable" } : {}),
  });

  revalidatePath(`/admin/orders/${id}`);
  return { notice: `Email sent to ${order.email}.` };
}

const notesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(5000),
});

/**
 * R4-FIX Ⓒ — the internal note. It always saved; it just never said so, and
 * swallowed both the admin check and the update error on the way. Same shape as
 * sendCustomerMessage now: guard, then a result the form can render.
 */
export async function updateOrderNotes(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  const parsed = notesSchema.safeParse({
    id: formData.get("id"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: "The note could not be saved." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ internal_notes: parsed.data.notes })
    .eq("id", parsed.data.id);
  if (error) return { error: "The note could not be saved." };

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  return { notice: "Note saved." };
}

const trackingSchema = z.object({
  id: z.string().uuid(),
  trackingCode: z.string().trim().max(120),
});

/** Carrier tracking code, typed by hand (ADR 0021). Empty clears it. */
export async function updateOrderTracking(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const parsed = trackingSchema.safeParse({
    id: formData.get("id"),
    trackingCode: formData.get("trackingCode") ?? "",
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ tracking_code: parsed.data.trackingCode || null })
    .eq("id", parsed.data.id);
  if (error) return;

  // An empty code is a CLEARING, and the renderer says so rather than printing
  // an empty code (order-events.ts).
  await recordOrderEvent(parsed.data.id, "tracking_set", { code: parsed.data.trackingCode });

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
}

const paidSchema = z.object({
  id: z.string().uuid(),
  /** Current state, submitted so the toggle is idempotent per render. */
  paid: z.boolean(),
});

/** "Register payment" — sets or clears orders.paid_at.
 *
 *  R4-MAIL-JOURNEY §C: SETTING it sends the customer the payment-registered
 *  mail. This is the one moment in the flow where the customer has just sent
 *  real money by hand over Vipps, typing an order code into a free-text field,
 *  and until now got nothing back.
 *
 *  Clearing it sends NOTHING: the mail follows the payment being registered,
 *  not every write of the column. And, like every admin-triggered mail, it is
 *  sent SYNCHRONOUSLY — Alessio can wait a second, and R4-ORDERS-PLUS needs the
 *  real outcome of the send for its activity log. */
export async function toggleOrderPaid(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const parsed = paidSchema.safeParse({
    id: formData.get("id"),
    paid: formData.get("paid") === "1",
  });
  if (!parsed.success) return;

  // `paid` is the CURRENT state, so the toggle is idempotent per render:
  // currently paid → we are clearing; currently unpaid → we are registering.
  const registering = !parsed.data.paid;
  const paidAt = registering ? new Date().toISOString() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ paid_at: paidAt })
    .eq("id", parsed.data.id);
  if (error) return;

  if (registering) {
    // R4-ORDERS-PLUS: this mail is the only new one in the project — without
    // its outcome in the log it would also be the only one whose fate is
    // invisible. A cancelled order (or one that can no longer be read) mails
    // nothing, which is `skipped`: nothing was sent.
    let email: EmailOutcome = "skipped";
    const order = await getOrder(parsed.data.id);
    // No mail for a cancelled order (R4-MAIL-JOURNEY §A), and never one that
    // could fail the toggle — the timestamp is already persisted.
    if (order && order.status !== "cancelled") {
      try {
        await sendStatusEmail({
          kind: "paid",
          status: order.status,
          code: order.code,
          customerName: order.customerName,
          customerEmail: order.email,
          locale: order.locale === "en" ? "en" : "no",
          trackingCode: order.trackingCode,
          paidAt,
        });
        email = `sent:${order.email}`;
      } catch (e) {
        email = "failed";
        console.error(`order ${order.code}: payment saved but email failed`, e);
      }
    }
    await recordOrderEvent(parsed.data.id, "payment_registered", { email });
  } else {
    // Undoing sends nothing (R4-MAIL-JOURNEY §C), so the meta is empty by
    // decision — not by omission.
    await recordOrderEvent(parsed.data.id, "payment_cleared", {});
  }

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
}

const ratifiedSchema = z.object({
  id: z.string().uuid(),
  /** Current state, submitted so the toggle is idempotent per render. */
  ratified: z.boolean(),
});

/** ADR 0022 — the shop stands behind the discount it showed. No email of its own. */
export async function toggleDiscountRatified(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const parsed = ratifiedSchema.safeParse({
    id: formData.get("id"),
    ratified: formData.get("ratified") === "1",
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({
      discount_ratified_at: parsed.data.ratified ? null : new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
}
