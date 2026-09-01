import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { OrderEventKind, OrderEventRow } from "./order-events";

/**
 * R4-ORDERS-PLUS §B — writing to the order's activity log.
 *
 * Same principle as the mail: this must NEVER fail the operation it is
 * recording, which by the time we get here is already persisted. A lost log
 * line is a lost log line; a lost order is a lost order. Hence try/catch +
 * console.error, and a return type that cannot carry a failure.
 *
 * Written ONLY from server actions, never from the client, on the cookie
 * client — so the insert goes through 0036's `authenticated` policy.
 */
export async function recordOrderEvent(
  orderId: string,
  kind: OrderEventKind,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("order_events")
      // Same cast create.ts uses for `p_items`: the callers build plain
      // JSON-safe objects, and `Json` cannot express that from Record<string,
      // unknown> without a runtime check nobody needs here.
      .insert({ order_id: orderId, kind, meta: meta as unknown as Json });
    if (error) console.error(`order ${orderId}: event ${kind} not logged`, error);
  } catch (e) {
    console.error(`order ${orderId}: event ${kind} not logged`, e);
  }
}

/**
 * The order's events, oldest first. An error degrades to an empty list: the
 * register must never be the reason an order cannot be opened — the synthetic
 * «Order created» row still renders from `orders.created_at`.
 */
export async function getOrderEvents(orderId: string): Promise<OrderEventRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("order_events")
      .select("id, created_at, kind, meta")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      kind: r.kind,
      meta: (r.meta ?? {}) as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}
