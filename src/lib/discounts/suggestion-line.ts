import type { CartLine, NewCartLine } from "@/lib/cart/cart";
import type { ActiveSuggestion } from "./discount";

/**
 * What this function actually needs of the donor. Narrower than `CartLine` on
 * purpose: the donor may be a line created in the same gesture, which has no id
 * yet (the product sheet's bundle). Narrowing the parameter is the honest fix —
 * a cast or a placeholder id would make the call compile while leaving the
 * contract false.
 */
export type SuggestionDonor = Pick<
  CartLine,
  "supplierId" | "supplierName" | "configCode" | "configSnapshot" | "layers"
>;

/**
 * The line `acceptSuggestion` (`cart-context.tsx`) adds to the cart — pulled
 * out as a pure function so the inheritance contract (ADR 0023 (e)) has a
 * unit test independent of the React hook it runs inside: configCode,
 * snapshot and layers come from the TRIGGERING line ("same design"); product
 * identity, price, slug, pieces and plate photo come from the rule's
 * resolved `suggested` card; `dealRuleId` is the ONLY thing about the price
 * that travels — no `pct`/amount is ever written onto the line itself (the
 * percentage is looked up live from `dealRuleId`, never stored).
 *
 * Returns null when the rule's suggested product failed to resolve (should
 * not happen by the time a suggestion is showing — `config.server.ts`
 * already drops those rules — but the type is optional, so this stays a
 * defensive no-op rather than a throw).
 */
export function buildSuggestionLine(
  suggestion: ActiveSuggestion,
  fromLine: SuggestionDonor
): NewCartLine | null {
  const p = suggestion.rule.suggested;
  if (!p) return null;
  return {
    productId: p.id,
    productNameNo: p.nameNo,
    productNameEn: p.nameEn,
    supplierId: fromLine.supplierId,
    supplierName: fromLine.supplierName,
    unitPriceCents: p.priceCents,
    currency: p.currency,
    quantity: suggestion.rule.suggestedQty,
    configCode: fromLine.configCode,
    configSnapshot: fromLine.configSnapshot,
    layers: fromLine.layers,
    plateImage: p.image ?? undefined,
    productSlug: p.slug,
    pieces: p.pieces,
    dealRuleId: suggestion.rule.id,
  };
}
