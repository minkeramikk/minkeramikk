/**
 * R4-UPSELL-MODALE / R4-SCONTI-2 — the offers as seen from the product sheet,
 * where the quantity is still the customer's to change.
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
 *
 * R4-SCONTI-2 §D: it returns a LIST, not the first offer. Either every unlocked
 * offer (capped at MAX_SUGGESTIONS by the engine, in the admin's own order) or a
 * single locked one when there is nothing unlocked — never both, and an empty
 * array when the band must not exist at all.
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
  | {
      kind: "unlocked";
      suggestion: ActiveSuggestion;
      /**
       * §D.1 — what the button adds of the CURRENT product. Two literal cases,
       * never a computed remainder: 0 when the cart ALONE already fires the
       * rule, the customer's own chosen quantity otherwise. The property that
       * makes it safe: an unlocked offer means `cart + selector >= threshold`,
       * so what is missing can never exceed the selector — the button never
       * adds more than the customer has already chosen.
       */
      baseQty: number;
      /** The rule suggests the very product the sheet is open on (ADR 0025). */
      selfOffer: boolean;
    }
  | { kind: "locked"; rule: DiscountRule; neededQty: number; missing: number };

type Candidate = {
  /** Identity of the line the customer is about to add. */
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  currency: Currency;
  configCode?: string;
};

type Opts = {
  supplierOf: (lineId: string) => string | null;
  supplierOfProduct: (productId: string) => string | null;
};

/**
 * What the engine would offer if the candidate line held `quantity` pieces —
 * the single place both states consult the engine, so neither can advertise
 * anything the engine would not actually deliver at that quantity.
 *
 * Beyond running `activeSuggestions`, this holds the two guards that make an
 * offer drawable and worth having: `rule.suggested` must resolve to a card and
 * `pct` must be > 0 (F1 — `discountMode: "none"`, or "inherited" paying nothing,
 * is a real admin configuration, not a bug; it must never read as an offer).
 */
function offersAt(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  candidate: Candidate,
  quantity: number,
  opts: Opts
): ActiveSuggestion[] {
  const hypothetical: DiscountLineInput = {
    id: candidate.id,
    productId: candidate.productId,
    unitPriceCents: candidate.unitPriceCents,
    currency: candidate.currency,
    quantity,
    configCode: candidate.configCode,
  };

  // The donor must be the line being added — it carries the design on screen —
  // so it goes LAST: activeSuggestions prefers the biggest trigger line, and
  // ties resolve first-seen, so passing the current configCode makes it win
  // outright (ADR 0024 §6).
  const suggestions = activeSuggestions([...lines, hypothetical], config, {
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
  });

  // Two guards, per row (R4-SCONTI-2: the sheet renders a LIST now, like the
  // cart, so a row that cannot be drawn is dropped rather than the whole block):
  //  - `rule.suggested` is the product card the row draws — name, price, image;
  //  - `pct > 0` because a rule the shop configured to pay nothing
  //    (`discountMode: "none"`, or "inherited" with the tier scale off or
  //    unreached) is not an offer, and must never read as one (F1).
  return suggestions.filter((s) => s.rule.suggested && s.pct > 0);
}

/** Pieces of the rule's trigger group ALREADY in the cart (excluded ones don't count). */
function inCartGroup(
  lines: DiscountLineInput[],
  rule: DiscountRule,
  config: DiscountConfig
): number {
  return lines
    .filter(
      (l) =>
        l.productId !== null &&
        rule.triggerProductIds.includes(l.productId) &&
        included(l.productId, config)
    )
    .reduce((n, l) => n + l.quantity, 0);
}

export function sheetOffers(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  candidate: Candidate,
  opts: Opts
): SheetOffer[] {
  if (!config.automationsEnabled) return [];

  // An excluded product neither triggers nor donates (ADR 0022) — checked
  // above BOTH branches (F2). "The unlocked branch gets this for free" was
  // only ever true of the TRIGGER contribution (activeSuggestions never
  // counts an excluded product into the trigger group): with the cart already
  // past the threshold on OTHER lines, activeSuggestions can still hand back
  // a suggestion for an excluded candidate, and the price on it is genuine —
  // but an excluded product still has no business hosting the panel.
  if (!included(candidate.productId, config)) return [];

  // R4-SCONTI-2 §D: every eligible offer, in the admin's own order (ADR 0024
  // §1), not `[0]` — showing one meant the second rule an admin configured was
  // reachable only by giving up on the first.
  const unlocked = offersAt(lines, config, candidate, candidate.quantity, opts);
  if (unlocked.length > 0) {
    return unlocked.map((suggestion) => ({
      kind: "unlocked" as const,
      suggestion,
      baseQty:
        inCartGroup(lines, suggestion.rule, config) >= suggestion.rule.triggerMinQty
          ? 0
          : candidate.quantity,
      selfOffer: suggestion.rule.suggestedProductId === candidate.productId,
    }));
  }

  // Locked: the first rule, in the admin's order, that this product could
  // still unlock. `neededQty` is arithmetic offerAt cannot do (it takes a
  // quantity, it doesn't invent one) — everything about whether the resulting
  // offer is real comes from projecting AT that quantity and trusting what
  // comes back, rule included: at neededQty the engine may prefer a different,
  // earlier rule (its own D1/D2 can rule THIS rule's candidate out while an
  // overlapping one still fires), and that is the one the customer will
  // actually see, so it is the one reported here (F3).
  for (const rule of config.rules) {
    if (!rule.triggerProductIds.includes(candidate.productId)) continue;

    // How many the STEPPER needs, given what the cart already contributes.
    // The mockup's fixed «Take N» assumes an empty cart and would ask for more
    // than necessary — and would contradict the engine, which fires as soon as
    // the GROUP reaches the threshold (D-Q2).
    const neededQty = Math.max(1, rule.triggerMinQty - inCartGroup(lines, rule, config));
    if (candidate.quantity >= neededQty) continue; // would already be unlocked

    const projected = offersAt(lines, config, candidate, neededQty, opts)[0];
    if (!projected) continue;
    return [
      {
        kind: "locked",
        rule: projected.rule,
        neededQty,
        missing: neededQty - candidate.quantity,
      },
    ];
  }
  return [];
}
