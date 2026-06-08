/**
 * Build order_items rows (with COMPLETE snapshots) from validated cart lines,
 * and split them by supplier (ADR 0007 — reused by F08's per-lab PDF). Pure,
 * no DB. Prices stay cents+currency (ADR 0005), never float.
 */
import { money, sum, type Money } from "@/lib/money/money";
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
}

export function buildOrderItemRows(items: OrderItemInput[]): OrderItemRow[] {
  return items.map((i) => ({
    supplier_id: i.supplierId,
    supplier_name_snapshot: i.supplierName,
    product_id: i.productId,
    product_name_snapshot: i.productName,
    price_cents_snapshot: i.unitPriceCents,
    currency_snapshot: i.currency,
    config_code: i.configCode,
    config_snapshot: i.configSnapshot ?? null,
    quantity: i.quantity,
  }));
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

/** Order total as Money (single currency; throws on cross-currency, ADR 0005). */
export function orderTotal(items: OrderItemInput[]): Money {
  if (items.length === 0) return money(0);
  return sum(
    items.map((i) => money(i.unitPriceCents * i.quantity, i.currency)),
    items[0].currency
  );
}
