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
 * offer drawable and worth having: `rule.suggested` must resolve to a card
 * (F4 — the sheet has one block, not a cart's droppable list) and `pct` must
 * be > 0 (F1 — `discountMode: "none"`, or "inherited" paying nothing, is a
 * real admin configuration, not a bug; it must never read as an offer).
 */
function offerAt(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  candidate: Candidate,
  quantity: number,
  opts: Opts
): ActiveSuggestion | null {
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
  const suggestion = activeSuggestions([...lines, hypothetical], config, {
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
  if (!suggestion) return null;

  // rule.suggested is the product card the block draws — name, price, image.
  // The cart can afford the engine's laxness here because it renders a LIST
  // and OfferRow drops an undrawable row (cart-suggestion.tsx:97-98); the
  // sheet has a SINGLE block, so an unlocked offer whose card cannot be drawn
  // is a dead end — render nothing rather than a broken block.
  if (!suggestion.rule.suggested) return null;

  // A rule the shop configured to pay nothing (`discountMode: "none"`, or
  // "inherited" with the tier scale off/unreached) is not an offer. Without
  // this the sheet could promise "Offer" and unlock into a suggestion at full
  // price — nothing was actually unlocked (F1).
  if (suggestion.pct <= 0) return null;

  return suggestion;
}

export function sheetOffer(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  candidate: Candidate,
  opts: Opts
): SheetOffer | null {
  if (!config.automationsEnabled) return null;

  const unlocked = offerAt(lines, config, candidate, candidate.quantity, opts);
  if (unlocked) return { kind: "unlocked", suggestion: unlocked };

  // An excluded product neither triggers nor donates (ADR 0022). The unlocked
  // branch gets this for free — activeSuggestions never counts it into the
  // trigger group — but the locked branch below computes its own trigger, so it
  // has to say it out loud, or the sheet would promise an offer that the cart
  // then refuses to honour.
  if (!included(candidate.productId, config)) return null;

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

    const projected = offerAt(lines, config, candidate, neededQty, opts);
    if (!projected) continue;
    return { kind: "locked", rule: projected.rule, neededQty, missing: neededQty - candidate.quantity };
  }
  return null;
}
