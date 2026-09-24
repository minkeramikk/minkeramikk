/**
 * R5-KIT — live price for a curated set/kit of pieces. Pure, no DB, no React.
 *
 * A featured card shows what the pieces COST: rows (slug × qty) + catalog
 * prices go in as `DiscountLineInput`s, the tier/deal discount config goes
 * in beside them, and `{ grossCents, netCents, currency }` comes out. A kit
 * and a set of the same pieces produce the same rows → the same price by
 * construction (AC5).
 */
import {
  cartSaved,
  computeCartDiscount,
  type DiscountConfig,
  type DiscountLineInput,
} from "@/lib/discounts/discount";
import type { Currency } from "@/lib/money/money";

export interface FeaturedPriceRow {
  productSlug: string;
  qty: number;
}

export interface FeaturedProduct {
  id: string;
  priceCents: number;
  currency: Currency;
}

export interface FeaturedPrice {
  grossCents: number;
  netCents: number;
  currency: Currency;
}

/**
 * `null` when a slug has no catalog price (the card hides the price) or
 * there are no rows. Never throws on empty input.
 */
export function featuredPrice(
  rows: FeaturedPriceRow[],
  products: Record<string, FeaturedProduct>,
  config: DiscountConfig
): FeaturedPrice | null {
  if (rows.length === 0) return null;
  const lines: DiscountLineInput[] = [];
  for (const r of rows) {
    const p = products[r.productSlug];
    if (!p) return null;
    lines.push({
      id: r.productSlug,
      productId: p.id,
      unitPriceCents: p.priceCents,
      currency: p.currency,
      quantity: r.qty,
    });
  }
  const currency = lines[0].currency;
  // a mixed-currency basket would make the discount math throw
  // (Money sum mismatch) and take the home down with it — hide the price
  if (!lines.every((l) => l.currency === currency)) return null;
  let grossCents = 0;
  for (const l of lines) grossCents += l.unitPriceCents * l.quantity;
  const discount = computeCartDiscount(lines, config);
  const saved = cartSaved(discount).amountCents;
  return { grossCents, netCents: grossCents - saved, currency };
}
