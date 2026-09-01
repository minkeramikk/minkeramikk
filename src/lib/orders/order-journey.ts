/**
 * R4-MAIL-JOURNEY: the order journey the customer is shown — on the thank-you
 * page AND inside every customer email. PURE: no React, no DB, no
 * `server-only`, and deliberately NO STRINGS. The page resolves these keys with
 * next-intl (`order.steps.*`), the emails from their own COPY table, because
 * mails render outside a request/locale context. Two cases for the same texts
 * is the project's existing pattern (email-html.ts) — a third one here would
 * only make it three.
 *
 * The real process, decided 1/9: order received → the customer pays on Vipps →
 * production → shipped. ONE payment.
 */
import type { OrderStatus } from "./order-status";

export const JOURNEY_STEPS = ["received", "paid", "production", "shipped"] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number];

/**
 * Index of the LAST thing that happened — never the next one. A mail is read
 * weeks after it was sent: a step written in the future eventually says
 * something false.
 *
 * `cancelled` is off-pipeline (order-status.ts) and returns null rather than an
 * index that would be wrong in every direction; the callers render no journey
 * block at all for it. `contacted` is the dormant legacy value and behaves like
 * `new`.
 */
export function currentStep(
  status: OrderStatus,
  paidAt?: string | null
): number | null {
  if (status === "cancelled") return null;
  if (status === "shipped" || status === "delivered") return 3;
  if (status === "in_production") return 2;
  if (paidAt) return 1;
  return 0;
}
