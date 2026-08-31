/**
 * R4-UPSELL-MODALE — the offer as seen from the product sheet, where the
 * quantity is still the customer's to change.
 *
 * The engine prices the cart that EXISTS. Here the question is prospective:
 * «if I added N of this product, would the rule fire?» — so the answer is
 * `activeSuggestions` run over the cart PLUS the line the customer is about to
 * add. No matching logic is duplicated: D1, D2, the trigger, the exclusion list
 * and the offer's own floor all come from there, unchanged.
 *
 * What it adds is the LOCKED state, which `activeSuggestions` cannot express by
 * construction: it only ever returns rules whose trigger is already satisfied
 * (discount.ts), and the sheet has to show the offer precisely when it is not —
 * nobody raises the quantity for an offer they do not know they can unlock.
 */
import {
  activeSuggestions,
  included,
  type ActiveSuggestion,
  type DiscountConfig,
  type DiscountLineInput,
  type DiscountRule,
} from "@/lib/discounts/discount";
import type { Currency } from "@/lib/money/money";

export type SheetOffer =
  | { kind: "unlocked"; suggestion: ActiveSuggestion }
  | { kind: "locked"; rule: DiscountRule; neededQty: number; missing: number };

export function sheetOffer(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  candidate: {
    /** Identity of the line the customer is about to add. */
    id: string;
    productId: string;
    quantity: number;
    unitPriceCents: number;
    currency: Currency;
    configCode?: string;
  },
  opts: {
    supplierOf: (lineId: string) => string | null;
    supplierOfProduct: (productId: string) => string | null;
  }
): SheetOffer | null {
  if (!config.automationsEnabled) return null;

  const hypothetical: DiscountLineInput = {
    id: candidate.id,
    productId: candidate.productId,
    unitPriceCents: candidate.unitPriceCents,
    currency: candidate.currency,
    quantity: candidate.quantity,
    configCode: candidate.configCode,
  };

  // The donor must be the line being added — it carries the design on screen —
  // so it goes LAST: activeSuggestions prefers the biggest trigger line, and
  // ties resolve first-seen, so passing the current configCode makes it win
  // outright (ADR 0024 §6).
  const unlocked = activeSuggestions([...lines, hypothetical], config, {
    // The hypothetical line has no identity in the caller's real supplierOf
    // (it is not a cart line yet), so that lookup legitimately misses for it —
    // fall back to the product-keyed lookup only then. Trying supplierOf(id)
    // FIRST (rather than special-casing candidate.id outright) keeps a caller
    // that already knows the candidate's id in charge of its own answer.
    supplierOf: (id) =>
      opts.supplierOf(id) ??
      (id === candidate.id ? opts.supplierOfProduct(candidate.productId) : null),
    supplierOfProduct: opts.supplierOfProduct,
    currentConfigCode: candidate.configCode ?? null,
  })[0];
  if (unlocked) return { kind: "unlocked", suggestion: unlocked };

  // An excluded product neither triggers nor donates (ADR 0022). The unlocked
  // branch gets this for free — activeSuggestions never counts it into the
  // trigger group — but the locked branch below computes its own trigger, so it
  // has to say it out loud, or the sheet would promise an offer that the cart
  // then refuses to honour.
  if (!included(candidate.productId, config)) return null;

  // Locked: the first rule, in the admin's order, that this product could
  // unlock. Same filters as the engine, minus the trigger — that is the one
  // being projected forward.
  for (const rule of config.rules) {
    if (!rule.triggerProductIds.includes(candidate.productId)) continue;
    if (!rule.suggested) continue;
    if (lines.some((l) => l.productId === rule.suggestedProductId)) continue; // D1
    const sup = opts.supplierOfProduct(candidate.productId);
    if (!sup || opts.supplierOfProduct(rule.suggestedProductId) !== sup) continue; // D2

    // How many the STEPPER needs, given what the cart already contributes.
    // The mockup's fixed «Take N» assumes an empty cart and would ask for more
    // than necessary — and would contradict the engine, which fires as soon as
    // the GROUP reaches the threshold (D-Q2).
    const inCartGroup = lines
      .filter(
        (l) =>
          l.productId !== null &&
          rule.triggerProductIds.includes(l.productId) &&
          included(l.productId, config)
      )
      .reduce((n, l) => n + l.quantity, 0);
    const neededQty = Math.max(1, rule.triggerMinQty - inCartGroup);
    if (candidate.quantity >= neededQty) continue; // would already be unlocked
    return { kind: "locked", rule, neededQty, missing: neededQty - candidate.quantity };
  }
  return null;
}
