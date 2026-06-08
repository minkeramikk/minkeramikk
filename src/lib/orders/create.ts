import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";
import { orderPayloadSchema } from "./schema";
import { buildOrderItemRows } from "./build";
import { verifyTurnstile } from "./turnstile";
import { sendOrderEmails, type EmailTransport } from "./email";

export type CreateOrderResult =
  | { ok: true; code: string }
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

  const db = deps.db ?? createServiceRoleClient();
  const { data: code, error } = await db.rpc("create_order", {
    p_customer_name: payload.customerName,
    p_email: payload.email,
    p_phone: payload.phone || "",
    p_message: payload.message || "",
    p_locale: payload.locale,
    p_items: buildOrderItemRows(payload.items) as unknown as Json,
  });
  if (error || !code) {
    return { ok: false, status: 500, error: "could not create order" };
  }

  // emails must not fail the order (it's already persisted)
  try {
    await sendOrderEmails(
      {
        code: code as string,
        customerName: payload.customerName,
        customerEmail: payload.email,
        locale: payload.locale,
        items: payload.items,
      },
      deps.transport
    );
  } catch (e) {
    console.error(`order ${code} created but email failed`, e);
  }

  return { ok: true, code: code as string };
}
