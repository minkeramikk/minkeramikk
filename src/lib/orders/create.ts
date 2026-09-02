import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";
import { orderPayloadSchema, type OrderItemInput } from "./schema";
import { buildOrderItemRows } from "./build";
import { verifyTurnstile } from "./turnstile";
import { sendOrderEmails, type EmailTransport } from "./email";
import { renderAndStoreCustomerPdf } from "./customer-pdf.server";
import { getVippsSettings } from "./vipps.server";
import { computeCartDiscount, type DiscountConfig } from "@/lib/discounts/discount";
import { getDiscountConfig } from "@/lib/discounts/config.server";

export type CreateOrderResult =
  | {
      ok: true;
      code: string;
      /** R4-TAKK: the NET total the server just computed and snapshotted, in
       *  minor units. Handed back so the thank-you page can show the very same
       *  figure the customer email quotes, without re-deriving it from a `set=`
       *  param that carries no deal rules (and so no deal discount). */
      totalCents: number;
      /** R4-MAIL-JOURNEY §E: the sends, NOT yet performed. The route handler
       *  hands this to `after()` so the customer gets the confirmation page
       *  without waiting on three emails. `createOrder` must NOT call `after()`
       *  itself — it is also called from tests, outside any request scope; the
       *  tests call this thunk directly and stay synchronous. Never throws. */
      sendEmails: () => Promise<void>;
    }
  | { ok: false; status: 400 | 500; error: string };

/**
 * Core order-creation flow (F05), independent of the Next request object so it
 * is unit-testable. Validates (zod) → verifies Turnstile → creates the order
 * atomically via the create_order() SQL function (sequence code, full
 * snapshots) → sends emails. Deps are injectable for tests.
 */
export async function createOrder(
  rawBody: unknown,
  deps: {
    verify?: (token: string) => Promise<boolean>;
    transport?: EmailTransport;
    db?: ReturnType<typeof createServiceRoleClient>;
    config?: DiscountConfig;
  } = {}
): Promise<CreateOrderResult> {
  const parsed = orderPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "invalid payload" };
  }
  const payload = parsed.data;

  const verify = deps.verify ?? verifyTurnstile;
  if (!(await verify(payload.turnstileToken))) {
    return { ok: false, status: 400, error: "turnstile failed" };
  }

  // R4-SCONTI (ADR 0022) — the discount is MONEY crossing a trust boundary, so
  // the server computes its own, from the DB config, with the same pure engine
  // the browser used. Nothing about the price comes from the payload except the
  // catalogue unit price and the rule ID (opaque, looked up here).
  const discountConfig = deps.config ?? (await getDiscountConfig());
  const keyOf = (_i: OrderItemInput, idx: number) => String(idx);
  const discount = computeCartDiscount(
    payload.items.map((i, idx) => ({
      id: String(idx),
      productId: i.productId,
      unitPriceCents: i.unitPriceCents,
      currency: i.currency,
      quantity: i.quantity,
      dealRuleId: i.appliedRuleId,
    })),
    discountConfig
  );

  const db = deps.db ?? createServiceRoleClient();
  const { data: code, error } = await db.rpc("create_order", {
    p_customer_name: payload.customerName,
    p_email: payload.email,
    p_phone: payload.phone || "",
    p_message: payload.message || "",
    p_locale: payload.locale,
    p_items: buildOrderItemRows(payload.items, discount, keyOf) as unknown as Json,
    p_address: payload.address || "",
    p_zipcode: payload.zipcode || "",
    p_country: payload.country || "",
    p_city: payload.city || "",
  });
  if (error || !code) {
    return { ok: false, status: 500, error: "could not create order" };
  }

  const orderCode = code as string;

  // R4-PDF-CLIENTE: `create_order` returns only the code (0032:148-210,
  // `returns text`), and the summary object is named after the order's UUID.
  // The id serves ONLY to name that object — it does not leave this file, does
  // not enter the HTTP response and appears in no URL (reuses ② and ③ were
  // dropped, NOTA 2/9). The order CODE would not do: it is sequential
  // (`'MK-' || nextval('order_seq')`, 0032:172), and a guessable path is a trap
  // for the first card that ever wanted to expose the file.
  const { data: row } = await db
    .from("orders")
    .select("id")
    .eq("code", orderCode)
    .maybeSingle();
  const orderId = row?.id ?? null;

  // Deferred, not fired: see `sendEmails` on CreateOrderResult. The try/catch is
  // INSIDE the thunk because an error thrown in `after()` surfaces to nobody —
  // without this a lost email is invisible. The order code is in the log line
  // precisely so the loss is chaseable.
  //
  // R4-PDF-CLIENTE: the summary is BUILT here, in the same deferred work, and
  // never on the synchronous path — the confirmation page must not wait on
  // @react-pdf and sharp. Its own try/catch is separate from the mail's: a
  // missing PDF must not cost the email (AC5).
  const sendEmails = async () => {
    let pdf: Buffer | null = null;
    if (orderId) {
      try {
        ({ pdf } = await renderAndStoreCustomerPdf(db, {
          orderId,
          code: orderCode,
          customerName: payload.customerName,
          locale: payload.locale,
          items: payload.items,
          discount,
          address: {
            address: payload.address,
            zipcode: payload.zipcode,
            city: payload.city,
            country: payload.country,
          },
          vipps: await getVippsSettings(),
        }));
      } catch (e) {
        // renderAndStoreCustomerPdf does not throw on its own; this is the
        // second belt, because inside `after()` an exception reaches nobody.
        console.error(`order ${orderCode}: summary PDF failed`, e);
      }
    }
    try {
      await sendOrderEmails(
        {
          code: orderCode,
          customerName: payload.customerName,
          customerEmail: payload.email,
          locale: payload.locale,
          items: payload.items,
          discount,
          pdf,
        },
        deps.transport
      );
    } catch (e) {
      console.error(`order ${orderCode} created but email failed`, e);
    }
  };

  return {
    ok: true,
    code: orderCode,
    totalCents: discount.total.amountCents,
    sendEmails,
  };
}
