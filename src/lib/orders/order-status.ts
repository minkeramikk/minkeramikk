/**
 * Order status — lifecycle v2 (ADR 0021). The DB enum `order_status`
 * (0001 + 0030) is a SUPERSET of what the back-office shows: `contacted` is a
 * dormant value, kept because a Postgres enum value cannot be dropped
 * additively. Pure module (labels, pipeline, KPI buckets, badge token) — no
 * I/O, unit-tested. Back-office is English-only (i18n rule 5), so labels are
 * plain strings here.
 */

/** Visible + writable in the back-office: the v2 machine. */
export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
  "cancelled",
] as const;

/** In the DB enum, never offered by the UI. Parsed so legacy rows keep their
 *  own identity instead of being coerced to `new` (see mapOrderRow). */
export const DORMANT_STATUSES = ["contacted"] as const;

export type OrderStatus =
  | (typeof ORDER_STATUSES)[number]
  | (typeof DORMANT_STATUSES)[number];

const ALL: readonly string[] = [...ORDER_STATUSES, ...DORMANT_STATUSES];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ALL.includes(value);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  in_production: "In production",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  contacted: "Contacted", // dormant
};

/** The happy-path pipeline shown as a steps indicator on the detail page.
 *  `cancelled` is off-pipeline (reachable from every state) and not in the line. */
export const STATUS_PIPELINE: readonly OrderStatus[] = [
  "new",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
];

/** "Open" = revenue committed but not yet delivered, and not cancelled.
 *  Drives the "open orders value" KPI. `contacted` stays here for legacy rows. */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  "new",
  "contacted",
  "confirmed",
  "in_production",
  "shipped",
];

export function isOpenStatus(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Soft status badge colour (DESIGN-SYSTEM §3.3): a `--status-*` token from
 *  globals.css, tinted at render. `cancelled` has no status token → destructive. */
export const STATUS_TOKEN: Record<OrderStatus, string> = {
  new: "--status-new",
  confirmed: "--status-confirmed",
  in_production: "--status-production",
  shipped: "--status-shipped",
  delivered: "--status-delivered",
  cancelled: "--destructive",
  contacted: "--status-contacted", // dormant
};
