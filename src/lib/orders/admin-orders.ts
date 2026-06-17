/**
 * Admin orders — PURE core (F07). Types + derivations + filters + KPI, no I/O
 * and no server imports, so it is fully unit-testable. The server fetchers live
 * in `admin-orders.server.ts`; the UI imports both.
 */
import { money, multiply, sum, type Currency, type Money } from "@/lib/money/money";
import {
  decodeConfigCode,
  normalizeConfigCode,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import {
  isOpenStatus,
  isOrderStatus,
  type OrderStatus,
} from "./order-status";

/** Human-readable configuration summary stored on the line (F03 snapshot). */
export interface OrderConfigSnapshot {
  designSlug?: string;
  designName?: string;
  selections?: { label: string; option: string; hex: string | null }[];
}

export interface AdminOrderItem {
  id: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  priceCentsSnapshot: number;
  currency: Currency;
  quantity: number;
  configCode: string | null;
  configSnapshot: OrderConfigSnapshot | null;
  /** F32: product photo path (`products/<slug>.png`) for the PDF visual recap,
   *  left-joined from `products` at fetch time. Null when `product_id` is NULL
   *  (product deleted/reimported → ON DELETE SET NULL) or the product has no
   *  image → degrade: no photo, the rest of the PDF is unaffected. */
  productImage: string | null;
}

export interface AdminOrder {
  id: string;
  code: string;
  customerName: string;
  email: string;
  phone: string | null;
  message: string | null;
  locale: string;
  status: OrderStatus;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
}

/** Raw shape of `orders` joined with `order_items` (snake_case from supabase). */
export interface RawOrderRow {
  id: string;
  code: string;
  customer_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  locale: string;
  status: string;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  order_items: {
    id: string;
    supplier_id: string;
    supplier_name_snapshot: string;
    product_name_snapshot: string;
    price_cents_snapshot: number;
    currency_snapshot: string;
    quantity: number;
    config_code: string | null;
    config_snapshot: unknown;
    product_id: string | null;
    products: { image: string | null } | null;
  }[];
}

export function mapOrderRow(row: RawOrderRow): AdminOrder {
  return {
    id: row.id,
    code: row.code,
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    locale: row.locale,
    status: isOrderStatus(row.status) ? row.status : "new",
    internalNotes: row.internal_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.order_items ?? []).map((it) => ({
      id: it.id,
      supplierId: it.supplier_id,
      supplierName: it.supplier_name_snapshot,
      productName: it.product_name_snapshot,
      priceCentsSnapshot: it.price_cents_snapshot,
      currency: (it.currency_snapshot as Currency) ?? "NOK",
      quantity: it.quantity,
      configCode: it.config_code,
      configSnapshot: (it.config_snapshot as OrderConfigSnapshot | null) ?? null,
      productImage: it.products?.image ?? null,
    })),
  };
}

/** "4 × Vietri Flat, 1 × Serveringsfat Stor" */
export function summarizeItems(items: AdminOrderItem[]): string {
  return items.map((i) => `${i.quantity} × ${i.productName}`).join(", ");
}

/** Distinct supplier names on the order, in first-seen order (ADR 0007 split). */
export function orderSuppliers(items: AdminOrderItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (!seen.has(i.supplierName)) {
      seen.add(i.supplierName);
      out.push(i.supplierName);
    }
  }
  return out;
}

/** Grand total as Money. Single currency per order (ADR 0005); empty → 0 NOK. */
export function orderTotal(items: AdminOrderItem[]): Money {
  if (items.length === 0) return money(0);
  const currency = items[0].currency;
  return sum(
    items.map((i) => multiply(money(i.priceCentsSnapshot, currency), i.quantity)),
    currency
  );
}

export interface OrderKpis {
  newCount: number;
  toContactCount: number;
  inProductionCount: number;
  openValue: Money;
}

/** Operational counters + open-orders value (computed over ALL orders, not the
 *  filtered view). Open value sums the totals of non-delivered/non-cancelled. */
export function computeKpis(orders: AdminOrder[]): OrderKpis {
  const currency = orders[0]?.items[0]?.currency ?? "NOK";
  const openTotals: Money[] = [];
  let newCount = 0;
  let toContactCount = 0;
  let inProductionCount = 0;
  for (const o of orders) {
    if (o.status === "new") newCount++;
    if (o.status === "contacted") toContactCount++;
    if (o.status === "in_production") inProductionCount++;
    if (isOpenStatus(o.status)) openTotals.push(orderTotal(o.items));
  }
  return {
    newCount,
    toContactCount,
    inProductionCount,
    openValue: openTotals.length ? sum(openTotals, currency) : money(0, currency),
  };
}

export interface OrderFilters {
  status?: string | null;
  supplierId?: string | null;
  q?: string | null;
}

/** Free-text match: customer name, email, order code, or a pasted config code
 *  (normalized, so "mk 2606" or "B1-K3…" both hit). */
export function orderMatchesQuery(order: AdminOrder, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  if (
    order.customerName.toLowerCase().includes(q) ||
    order.email.toLowerCase().includes(q) ||
    order.code.toLowerCase().includes(q)
  ) {
    return true;
  }
  const qCode = normalizeConfigCode(qRaw);
  if (qCode) {
    return order.items.some(
      (i) => i.configCode && normalizeConfigCode(i.configCode).includes(qCode)
    );
  }
  return false;
}

/** Apply status + supplier + text filters (combinable). Order is preserved. */
export function filterOrders(
  orders: AdminOrder[],
  { status, supplierId, q }: OrderFilters
): AdminOrder[] {
  return orders.filter((o) => {
    if (status && isOrderStatus(status) && o.status !== status) return false;
    if (supplierId && !o.items.some((i) => i.supplierId === supplierId)) {
      return false;
    }
    if (q && q.trim() && !orderMatchesQuery(o, q)) return false;
    return true;
  });
}

/** Decode a line's config code into a configurator deep-link (F04 → URL), so
 *  the operator can reopen the exact design on the phone with the customer.
 *  Tolerant: unknown/inactive design or malformed code → null (not clickable). */
export function configuratorPathFromCode(
  code: string | null,
  codecDesigns: CodecDesign[],
  locale: "no" | "en" = "no"
): string | null {
  if (!code) return null;
  try {
    const { designSlug, selections } = decodeConfigCode(
      code,
      (c) => codecDesigns.find((d) => d.code === c.toUpperCase()) ?? null
    );
    const params = new URLSearchParams();
    params.set("design", designSlug);
    params.set("step", "2");
    for (const [catSlug, optId] of Object.entries(selections)) {
      params.set(`opt_${catSlug}`, optId);
    }
    return `/${locale}/configurator?${params.toString()}`;
  } catch {
    return null;
  }
}
