import { describe, expect, it } from "vitest";
import {
  EMPTY_CONFIG,
  MAX_SUGGESTIONS,
  type ActiveSuggestion,
  type DiscountRule,
} from "@/lib/discounts/discount";
import { sheetOffers, type SheetOffer } from "@/lib/discounts/sheet-offer";

const UNIT = 45000;
const rule = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: "r1",
  name: "sheet offer",
  triggerProductIds: ["plate"],
  triggerMinQty: 4,
  suggestedProductId: "deep",
  suggestedQty: 4,
  discountMode: "fixed",
  discountPct: 50,
  suggested: {
    id: "deep", slug: "deep", nameNo: "Dyp tallerken", nameEn: "Deep plate",
    priceCents: 35000, currency: "NOK", image: null, pieces: 1, supplierId: "s1",
  },
  ...over,
});
const cfg = (r: DiscountRule) =>
  ({ ...EMPTY_CONFIG, automationsEnabled: true, rules: [r] });

// Mirrors the real cart lookup: it only knows the suppliers of lines that are
// actually IN the cart (the fixed set of ids these tests use), not the
// hypothetical line sheetOffer is evaluating — that one never has an id the
// caller recognises, so its supplier can only come from the product-keyed
// fallback (F1). A stub that answered every id the same way could never tell
// the fallback apart from a caller lookup that just happened to resolve.
const KNOWN_LINE_SUPPLIERS: Record<string, string> = { l1: "s1", d: "s1" };
const opts = {
  supplierOf: (lineId: string) => KNOWN_LINE_SUPPLIERS[lineId] ?? null,
  supplierOfProduct: () => "s1",
};
const candidate = (quantity: number) => ({
  id: "candidate", productId: "plate", quantity,
  unitPriceCents: UNIT, currency: "NOK" as const, configCode: "MK-X",
});

/** The first offer of the list, or null — the shape these tests were written
 *  against, before §D turned the single offer into a list. */
function first(
  ...args: Parameters<typeof sheetOffers>
): SheetOffer | null {
  return sheetOffers(...args)[0] ?? null;
}

/** Narrows without a cast: fails loudly if the offer isn't unlocked. */
function expectUnlocked(out: SheetOffer | null): ActiveSuggestion {
  expect(out?.kind).toBe("unlocked");
  if (out?.kind !== "unlocked") throw new Error("expected an unlocked offer");
  return out.suggestion;
}

describe.each([
  ["the card's own numbers", rule()],
  ["a different threshold and offer", rule({ triggerMinQty: 6, suggestedQty: 2, discountPct: 20 })],
])("%s", (_l, r) => {
  const q = r.triggerMinQty;

  it("below the threshold: locked, and says exactly how many are missing", () => {
    const out = first([], cfg(r), candidate(1), opts);
    expect(out).toEqual({ kind: "locked", rule: r, neededQty: q, missing: q - 1 });
  });

  it("at the threshold: unlocked, carrying the priced suggestion", () => {
    const out = first([], cfg(r), candidate(q), opts);
    const suggestion = expectUnlocked(out);
    expect(suggestion.rule.id).toBe(r.id);
    expect(suggestion.pct).toBe(r.discountPct);
  });

  it("above the threshold: still unlocked", () => {
    expect(first([], cfg(r), candidate(q + 3), opts)?.kind).toBe("unlocked");
  });

  it("the cart already holds part of the trigger group: fewer are needed", () => {
    const inCart = [
      { id: "l1", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const, quantity: q - 1 },
    ];
    const out = first(inCart, cfg(r), candidate(1), opts);
    // one in the cart's group short, one in the stepper → already unlocked
    expect(out?.kind).toBe("unlocked");
  });

  it("the cart holds part of the group but stays locked: neededQty is only what's left", () => {
    // Two short of the group, one in the stepper → still one short, not the
    // mockup's cart-blind "triggerMinQty" (D-Q2).
    const inCart = [
      { id: "l1", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const, quantity: q - 2 },
    ];
    const out = first(inCart, cfg(r), candidate(1), opts);
    expect(out).toEqual({ kind: "locked", rule: r, neededQty: 2, missing: 1 });
  });

  it("the donor is the line being added, so the suggestion wears the CURRENT design", () => {
    const out = first([], cfg(r), candidate(q), opts);
    // Resolving at all requires the fallback (F1): "candidate" is not a real
    // cart line id, so opts.supplierOf legitimately misses it.
    expect(expectUnlocked(out).fromLineId).toBe("candidate");
  });

  it("a bigger competing line of the same trigger product doesn't steal the donor role", () => {
    // Already-met trigger without the candidate's help, and BIGGER than it —
    // byQty alone would pick this line. Only the current configCode saves the
    // candidate as donor (ADR 0024 §6).
    const inCart = [
      {
        id: "big", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const,
        quantity: q + 5, configCode: "OTHER",
      },
    ];
    const out = first(inCart, cfg(r), candidate(1), opts);
    expect(expectUnlocked(out).fromLineId).toBe("candidate");
  });

  it("locked but the supplier mismatches too: still null, not a false 'locked' offer", () => {
    const out = first([], cfg(r), candidate(1), {
      ...opts,
      supplierOfProduct: (pid) => (pid === r.suggestedProductId ? "s2" : "s1"),
    });
    expect(out).toBeNull();
  });

  it("an unresolved suggested card unlocks nothing (F4, unlocked direction)", () => {
    const noCard: DiscountRule = { ...r, suggested: undefined };
    const out = first([], cfg(noCard), candidate(q), opts);
    expect(out).toBeNull();
  });

  it("an unresolved suggested card locks nothing either (F4, locked direction)", () => {
    const noCard: DiscountRule = { ...r, suggested: undefined };
    const out = first([], cfg(noCard), candidate(1), opts);
    expect(out).toBeNull();
  });

  it("F1 — discountMode 'none' pays nothing: null locked AND null unlocked", () => {
    const noPayout: DiscountRule = { ...r, discountMode: "none", discountPct: null };
    expect(first([], cfg(noPayout), candidate(1), opts)).toBeNull(); // would be locked
    expect(first([], cfg(noPayout), candidate(q), opts)).toBeNull(); // would be unlocked
  });

  it("F1 — 'inherited' with the tier scale off pays nothing: null in both states", () => {
    const inherited: DiscountRule = { ...r, discountMode: "inherited" };
    const config = { ...cfg(inherited), tiersEnabled: false };
    expect(first([], config, candidate(1), opts)).toBeNull();
    expect(first([], config, candidate(q), opts)).toBeNull();
  });

  it("F1 — 'inherited' with the tier scale on and a matching tier: still offered", () => {
    const inherited: DiscountRule = { ...r, discountMode: "inherited" };
    const config = { ...cfg(inherited), tiersEnabled: true, tiers: [{ minQty: 2, pct: 20 }] };
    expect(first([], config, candidate(1), opts)?.kind).toBe("locked");
    expect(expectUnlocked(first([], config, candidate(q), opts)).pct).toBe(20);
  });
});

it("no rule applies: null, and the sheet renders exactly as today", () => {
  expect(first([], { ...EMPTY_CONFIG, automationsEnabled: true, rules: [] }, candidate(9), opts)).toBeNull();
});

it("automations off: null", () => {
  expect(first([], { ...cfg(rule()), automationsEnabled: false }, candidate(9), opts)).toBeNull();
});

it("D1 (ADR 0025) — the suggested product bought at full price no longer hides the offer", () => {
  // It used to return null here: the old D1 was "the suggested product is in the
  // cart", so buying the ceramic at full price switched its own offer off. Now
  // only the offer's own discounted line closes it, so the sheet still shows the
  // way to unlock it.
  const inCart = [{ id: "d", productId: "deep", unitPriceCents: 35000, currency: "NOK" as const, quantity: 1 }];
  expect(first(inCart, cfg(rule()), candidate(1), opts)).toEqual({
    kind: "locked", rule: rule(), neededQty: 4, missing: 3,
  });
});

it("D1 (ADR 0025) — an offer already TAKEN in full is gone", () => {
  const inCart = [
    { id: "l1", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const, quantity: 4 },
    { id: "d", productId: "deep", unitPriceCents: 35000, currency: "NOK" as const, quantity: 4, dealRuleId: "r1" },
  ];
  expect(first(inCart, cfg(rule()), candidate(1), opts)).toBeNull();
});

it("D2 — the suggested product is another supplier's: null", () => {
  expect(
    first([], cfg(rule()), candidate(9), {
      ...opts,
      // product-keyed, not id-keyed: the trigger product ("plate") stays on
      // "s1", only the suggested product ("deep") moves to another supplier.
      supplierOfProduct: (pid) => (pid === "deep" ? "s2" : "s1"),
    })
  ).toBeNull();
});

it("an EXCLUDED product never triggers — not even the locked state", () => {
  // `includedProductIds` is an opt-out multi-select: non-empty means the list
  // IS the inclusion set, so "deep" alone excludes "plate" (discount.ts:142).
  const config = { ...cfg(rule()), includedProductIds: ["deep"] };
  expect(first([], config, candidate(1), opts)).toBeNull(); // would be locked
  expect(first([], config, candidate(9), opts)).toBeNull(); // would be unlocked
});

it("F2 — an EXCLUDED product hosts no offer even once OTHER lines already meet the trigger", () => {
  // The rule's trigger group spans two products; the cart's "mug" line alone
  // already meets it, but the sheet is open on "plate" — excluded, so it must
  // neither trigger NOR host the panel, even though the deal genuinely applies
  // to whoever it does trigger for.
  const r = rule({ triggerProductIds: ["plate", "mug"], triggerMinQty: 4 });
  const config = { ...cfg(r), includedProductIds: ["mug"] };
  const inCart = [{ id: "l1", productId: "mug", unitPriceCents: UNIT, currency: "NOK" as const, quantity: 4 }];
  expect(first(inCart, config, candidate(1), opts)).toBeNull();
});

it("F3 — the locked panel reports the rule the engine will actually deliver, not the loop's own candidate", () => {
  // Two rules both triggered by "plate", admin order [A, B]. A's suggested
  // product belongs to another supplier (D2), so A can never actually be offered
  // — but only the ENGINE knows that; a loop re-deriving the filters on its own
  // candidate would have skipped straight to B and reported ITS threshold (2),
  // not A's (6).
  const ruleA = rule({
    id: "rA", triggerProductIds: ["plate"], triggerMinQty: 6,
    suggestedProductId: "vase", suggestedQty: 1,
    suggested: { id: "vase", slug: "vase", nameNo: "Vase", nameEn: "Vase", priceCents: 30000, currency: "NOK", image: null, pieces: 1, supplierId: "s2" },
  });
  const ruleB = rule({
    id: "rB", triggerProductIds: ["plate"], triggerMinQty: 2,
    suggestedProductId: "mug", suggestedQty: 1, discountPct: 15,
    suggested: { id: "mug", slug: "mug", nameNo: "Krus", nameEn: "Mug", priceCents: 20000, currency: "NOK", image: null, pieces: 1, supplierId: "s1" },
  });
  const config = { ...EMPTY_CONFIG, automationsEnabled: true, rules: [ruleA, ruleB] };
  const inCart: never[] = [];
  const byProduct = { ...opts, supplierOfProduct: (pid: string) => (pid === "vase" ? "s2" : "s1") };

  const locked = first(inCart, config, candidate(1), byProduct);
  expect(locked).toEqual({ kind: "locked", rule: ruleB, neededQty: 6, missing: 5 });

  // Stepping to EXACTLY the quantity the locked panel promised must deliver
  // the SAME rule — the governing promise, checked end to end.
  const unlocked = expectUnlocked(first(inCart, config, candidate(6), byProduct));
  expect(unlocked.rule.id).toBe(ruleB.id);
});

describe("§D.1 — what the button adds: two literal cases, never a remainder", () => {
  const r8 = rule({ triggerMinQty: 8 });
  const plates = (quantity: number) => [
    { id: "l1", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const, quantity },
  ];
  const baseOf = (inCart: number, selector: number) => {
    const out = sheetOffers(inCart ? plates(inCart) : [], cfg(r8), candidate(selector), opts);
    expect(out[0]?.kind).toBe("unlocked");
    return out[0]?.kind === "unlocked" ? out[0].baseQty : -1;
  };

  // The card's own table, row by row. Threshold 8.
  it("cart 0, selector 8 → 8 plates + the offer", () => expect(baseOf(0, 8)).toBe(8));
  it("cart 3, selector 5 → 5 plates + the offer", () => expect(baseOf(3, 5)).toBe(5));
  it("cart 5, selector 5 → 5 plates + the offer, never a remainder of 3", () =>
    expect(baseOf(5, 5)).toBe(5));
  it("cart 8, selector 1 → ONLY the offer", () => expect(baseOf(8, 1)).toBe(0));

  it("the button never adds more than the customer has already chosen", () => {
    for (const [inCart, selector] of [
      [0, 8],
      [3, 5],
      [5, 5],
      [8, 1],
    ] as const) {
      expect(baseOf(inCart, selector)).toBeLessThanOrEqual(selector);
    }
  });
});

describe("§D — the list, not the first offer", () => {
  const suggestedCard = (id: string) => ({
    id, slug: id, nameNo: id, nameEn: id,
    priceCents: 20000, currency: "NOK" as const, image: null, pieces: 1, supplierId: "s1",
  });
  const ruleN = (id: string, suggests: string) =>
    rule({ id, suggestedProductId: suggests, suggested: suggestedCard(suggests) });
  const cfgN = (rules: DiscountRule[]) => ({
    ...EMPTY_CONFIG, automationsEnabled: true, rules,
  });

  it("three eligible rules → three rows, in the admin's own order", () => {
    const out = sheetOffers(
      [],
      cfgN([ruleN("r1", "deep"), ruleN("r2", "mug"), ruleN("r3", "bowl")]),
      candidate(4),
      opts
    );
    expect(out.map((o) => (o.kind === "unlocked" ? o.suggestion.rule.id : o.kind))).toEqual([
      "r1", "r2", "r3",
    ]);
  });

  it("past the cap: MAX_SUGGESTIONS rows, the rest silently unshown", () => {
    const out = sheetOffers(
      [],
      cfgN([ruleN("r1", "a"), ruleN("r2", "b"), ruleN("r3", "c"), ruleN("r4", "d")]),
      candidate(4),
      opts
    );
    expect(out).toHaveLength(MAX_SUGGESTIONS);
  });

  it("zero offers → an empty list: the band does not exist", () => {
    expect(sheetOffers([], { ...EMPTY_CONFIG, automationsEnabled: true }, candidate(4), opts))
      .toEqual([]);
  });

  it("the same-product offer is flagged, and its base is the chosen quantity", () => {
    const self = rule({
      suggestedProductId: "plate",
      suggested: suggestedCard("plate"),
    });
    const out = sheetOffers([], cfg(self), candidate(4), opts);
    expect(out[0]).toMatchObject({ kind: "unlocked", selfOffer: true, baseQty: 4 });
  });

  it("a cross-product offer is not flagged as its own", () => {
    const out = sheetOffers([], cfg(rule()), candidate(4), opts);
    expect(out[0]).toMatchObject({ kind: "unlocked", selfOffer: false });
  });

  it("nothing unlocked but something reachable → ONE locked row, as before", () => {
    expect(sheetOffers([], cfg(rule()), candidate(1), opts)).toEqual([
      { kind: "locked", rule: rule(), neededQty: 4, missing: 3 },
    ]);
  });
});
