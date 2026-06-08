/**
 * Order status (F07). The enum mirrors `order_status` in 0001_schema.sql.
 * Pure module (labels, pipeline, KPI buckets, badge token) — no I/O, unit-tested.
 * Back-office is English-only (i18n rule 5), so labels are plain strings here.
 */
export const ORDER_STATUSES = [
  "new",
  "contacted",
  "confirmed",
  "in_production",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  contacted: "Contacted",
  confirmed: "Confirmed",
  in_production: "In production",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** The happy-path pipeline shown as a steps indicator on the detail page.
 *  `cancelled` is terminal/off-pipeline and not part of the line. */
export const STATUS_PIPELINE: readonly OrderStatus[] = [
  "new",
  "contacted",
  "confirmed",
  "in_production",
  "delivered",
];

/** "Open" = revenue committed but not yet delivered, and not cancelled.
 *  Drives the "open orders value" KPI and the "new / to contact / in production"
 *  operational counters. */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  "new",
  "contacted",
  "confirmed",
  "in_production",
];

export function isOpenStatus(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Soft status badge colour (DESIGN-SYSTEM §3.3): a `--status-*` token from
 *  globals.css, tinted at render. `cancelled` has no status token → destructive. */
export const STATUS_TOKEN: Record<OrderStatus, string> = {
  new: "--status-new",
  contacted: "--status-contacted",
  confirmed: "--status-confirmed",
  in_production: "--status-production",
  delivered: "--status-delivered",
  cancelled: "--destructive",
};
