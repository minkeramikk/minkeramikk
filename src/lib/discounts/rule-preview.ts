import { formatMoney, money, multiply, percentOf, type Currency } from "@/lib/money/money";

/**
 * R4-SCONTI-2 §B — the rule, read back in plain English, under the rule card.
 *
 * With the same-product upsell unlocked (ADR 0025) an admin can configure very
 * aggressive rules by accident — trigger 1 → suggest 10. We do not forbid them:
 * nobody must be able to SAVE one without having read it in the clear.
 *
 * Pure and admin-only (English, no next-intl), so it can be unit-tested without
 * React and without a locale. The money goes through the Money VO like every
 * other amount in this codebase (ADR 0005); `discountPct` stays a label.
 */
export function rulePreview(input: {
  triggerMinQty: number;
  suggestedQty: number;
  /** Only a completeness guard — the sentence never names the product. */
  suggestedName: string;
  discountMode: "fixed" | "inherited" | "none";
  discountPct: number | null;
  /** Absent (unknown price) ⇒ the sentence simply carries no amount. */
  suggestedPriceCents?: number | null;
  currency?: Currency;
}): string | null {
  const { triggerMinQty, suggestedQty, suggestedName, discountMode, discountPct } = input;
  if (!suggestedName || triggerMinQty < 1 || suggestedQty < 1) return null;

  const head = `With ${triggerMinQty} in the basket the customer`;
  if (discountMode === "none") {
    return `${head} is suggested ${suggestedQty} more at full price.`;
  }
  if (discountMode === "inherited") {
    return `${head} gets ${suggestedQty} more at the quantity discount the trigger group earns.`;
  }
  if (discountPct === null || discountPct <= 0) return null; // not a rule yet
  const saved =
    input.suggestedPriceCents != null
      ? percentOf(
          multiply(money(input.suggestedPriceCents, input.currency ?? "NOK"), suggestedQty),
          discountPct
        )
      : null;
  const amount = saved ? ` (−${formatMoney(saved, "no")})` : "";
  return `${head} gets ${suggestedQty} more at −${discountPct}%${amount}.`;
}
