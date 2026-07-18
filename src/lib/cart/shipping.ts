/**
 * Insured shipping + free-shipping threshold (R3-B4). Pure, no React.
 *
 * The order is a REQUEST the shop confirms by hand: below the threshold we only
 * inform ("Beregnes" + how much is missing), we never block the send. All
 * arithmetic goes through the Money value object (ADR 0005) — never floats.
 *
 * The threshold lives in the environment (no migration): if it ever has to be
 * editable from admin it becomes a `settings` row (out of scope).
 */
import { money, subtract, type Money } from "@/lib/money/money";

const DEFAULT_THRESHOLD_CENTS = 100_000; // 1.000 NOK

const envThreshold = Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_NOK);

/** Free-shipping threshold, from env (whole NOK) with a 1.000 NOK fallback. */
export const freeShippingThreshold: Money = money(
  Number.isFinite(envThreshold) && envThreshold > 0
    ? Math.round(envThreshold * 100)
    : DEFAULT_THRESHOLD_CENTS
);

export type ShippingStatus =
  | { included: true }
  | { included: false; missing: Money };

/** Included at or above the threshold; otherwise how much is still missing. */
export function shippingStatus(
  total: Money,
  threshold: Money = freeShippingThreshold
): ShippingStatus {
  if (total.amountCents >= threshold.amountCents) return { included: true };
  return { included: false, missing: subtract(threshold, total) };
}
