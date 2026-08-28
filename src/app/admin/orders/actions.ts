"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrder } from "@/lib/orders/admin-orders.server";
import { sendStatusEmail } from "@/lib/orders/email";
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status, ...(trackingCode ? { tracking_code: trackingCode } : {}) })
    .eq("id", id);
  if (error) return { error: "Failed to update status. Please try again." };

  let notice = `Status set to ${status}.`;
  if (sendEmail && canEmail(status)) {
    try {
      await sendStatusEmail({
        status,
        code: order.code,
        customerName: order.customerName,
        customerEmail: order.email,
        locale: order.locale === "en" ? "en" : "no",
        trackingCode: tracking,
        paidAt: order.paidAt,
      });
      notice += ` Email sent to ${order.email}.`;
    } catch (e) {
      console.error(`order ${order.code}: status saved but email failed`, e);
      notice += " The status was saved but the email could not be sent.";
    }
  }

  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin");
  return { notice };
}

const notesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(5000),
});

export async function updateOrderNotes(formData: FormData): Promise<void> {
  const parsed = notesSchema.safeParse({
    id: formData.get("id"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({ internal_notes: parsed.data.notes })
    .eq("id", parsed.data.id);

  revalidatePath(`/admin/orders/${parsed.data.id}`);
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
  await supabase
    .from("orders")
    .update({ tracking_code: parsed.data.trackingCode || null })
    .eq("id", parsed.data.id);

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
}

const paidSchema = z.object({
  id: z.string().uuid(),
  /** Current state, submitted so the toggle is idempotent per render. */
  paid: z.boolean(),
});

/** "Register payment" — sets or clears orders.paid_at. No email of its own. */
export async function toggleOrderPaid(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const parsed = paidSchema.safeParse({
    id: formData.get("id"),
    paid: formData.get("paid") === "1",
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({ paid_at: parsed.data.paid ? null : new Date().toISOString() })
    .eq("id", parsed.data.id);

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
}
