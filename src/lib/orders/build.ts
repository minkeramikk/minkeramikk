/**
 * Build order_items rows (with COMPLETE snapshots) from validated cart lines,
 * and split them by supplier (ADR 0007 — reused by F08's per-lab PDF). Pure,
 * no DB. Prices stay cents+currency (ADR 0005), never float.
 */
import { money, sum, type Money } from "@/lib/money/money";
import type { CartDiscount } from "@/lib/discounts/discount";
import type { OrderItemInput } from "./schema";

/** Snake-case row shape the create_order() SQL function consumes (jsonb items). */
export interface OrderItemRow {
  supplier_id: string;
  supplier_name_snapshot: string;
  product_id: string | null;
  product_name_snapshot: string;
  price_cents_snapshot: number;
  currency_snapshot: string;
  config_code: string;
  config_snapshot: unknown;
  quantity: number;
  /** R4-SCONTI (ADR 0022): frozen at send time, never recomputed. */
  discount_pct: number | null;
  discount_cents: number;
  discount_source: string | null;
}

/**
 * R4-SCONTI: `discount` is the SERVER's own computation (create.ts), and
 * `keyOf` maps a payload item onto the line id used in it. The payload's own
 * discount fields, if any, are ignored by construction — they are not read here.
 */
export function buildOrderItemRows(
  items: OrderItemInput[],
  discount: CartDiscount,
  keyOf: (item: OrderItemInput, index: number) => string
): OrderItemRow[] {
  return items.map((i, idx) => {
    const d = discount.perLine[keyOf(i, idx)];
    const has = d && d.pct > 0;
    return {
      supplier_id: i.supplierId,
      supplier_name_snapshot: i.supplierName,
      product_id: i.productId,
      product_name_snapshot: i.productName,
      price_cents_snapshot: i.unitPriceCents,
      currency_snapshot: i.currency,
      config_code: i.configCode,
      config_snapshot: i.configSnapshot ?? null,
      quantity: i.quantity,
      // Math.round: the SQL casts discount_pct with `::int` (0032:190+). pct is
      // an integer everywhere today, but part ②'s DiscountRule.discountPct is
      // a bare `number` — a fractional rule % would abort the insert with
      // 22P02, same failure class as the discount_pct=0 CHECK trap above.
      discount_pct: has ? Math.round(d.pct) : null,
      discount_cents: has ? d.saved.amountCents : 0,
      discount_source: has ? d.source : null,
    };
  });
}

/** Group items by supplier (for the per-lab PDF, F08). Generic over anything
 *  carrying a `supplierId`, so it serves both the cart's OrderItemInput (F05)
 *  and the admin AdminOrderItem (F08). */
export function splitBySupplier<T extends { supplierId: string }>(
  items: T[]
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const i of items) {
    const arr = out.get(i.supplierId) ?? [];
    arr.push(i);
    out.set(i.supplierId, arr);
  }
  return out;
}

/** Order total as Money (single currency; throws on cross-currency, ADR 0005).
 *  GROSS — pre-discount. Only used by orders.test.ts; the admin-facing net
 *  total lives in admin-orders.ts's own `orderTotal` (a different function,
 *  same name — do not conflate the two). */
export function orderTotal(items: OrderItemInput[]): Money {
  if (items.length === 0) return money(0);
  return sum(
    items.map((i) => money(i.unitPriceCents * i.quantity, i.currency)),
    items[0].currency
  );
}
