import { describe, expect, it } from "vitest";
import {
  EMPTY_CONFIG,
  type ActiveSuggestion,
  type DiscountRule,
} from "@/lib/discounts/discount";
import { sheetOffer, type SheetOffer } from "@/lib/discounts/sheet-offer";

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
    const out = sheetOffer([], cfg(r), candidate(1), opts);
    expect(out).toEqual({ kind: "locked", rule: r, neededQty: q, missing: q - 1 });
  });

  it("at the threshold: unlocked, carrying the priced suggestion", () => {
    const out = sheetOffer([], cfg(r), candidate(q), opts);
    const suggestion = expectUnlocked(out);
    expect(suggestion.rule.id).toBe(r.id);
    expect(suggestion.pct).toBe(r.discountPct);
  });

  it("above the threshold: still unlocked", () => {
    expect(sheetOffer([], cfg(r), candidate(q + 3), opts)?.kind).toBe("unlocked");
  });

  it("the cart already holds part of the trigger group: fewer are needed", () => {
    const inCart = [
      { id: "l1", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const, quantity: q - 1 },
    ];
    const out = sheetOffer(inCart, cfg(r), candidate(1), opts);
    // one in the cart's group short, one in the stepper → already unlocked
    expect(out?.kind).toBe("unlocked");
  });

  it("the cart holds part of the group but stays locked: neededQty is only what's left", () => {
    // Two short of the group, one in the stepper → still one short, not the
    // mockup's cart-blind "triggerMinQty" (D-Q2).
    const inCart = [
      { id: "l1", productId: "plate", unitPriceCents: UNIT, currency: "NOK" as const, quantity: q - 2 },
    ];
    const out = sheetOffer(inCart, cfg(r), candidate(1), opts);
    expect(out).toEqual({ kind: "locked", rule: r, neededQty: 2, missing: 1 });
  });

  it("the donor is the line being added, so the suggestion wears the CURRENT design", () => {
    const out = sheetOffer([], cfg(r), candidate(q), opts);
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
    const out = sheetOffer(inCart, cfg(r), candidate(1), opts);
    expect(expectUnlocked(out).fromLineId).toBe("candidate");
  });

  it("locked but the supplier mismatches too: still null, not a false 'locked' offer", () => {
    const out = sheetOffer([], cfg(r), candidate(1), {
      ...opts,
      supplierOfProduct: (pid) => (pid === r.suggestedProductId ? "s2" : "s1"),
    });
    expect(out).toBeNull();
  });

  it("an unresolved suggested card unlocks nothing (F4, unlocked direction)", () => {
    const noCard: DiscountRule = { ...r, suggested: undefined };
    const out = sheetOffer([], cfg(noCard), candidate(q), opts);
    expect(out).toBeNull();
  });

  it("an unresolved suggested card locks nothing either (F4, locked direction)", () => {
    const noCard: DiscountRule = { ...r, suggested: undefined };
    const out = sheetOffer([], cfg(noCard), candidate(1), opts);
    expect(out).toBeNull();
  });
});

it("no rule applies: null, and the sheet renders exactly as today", () => {
  expect(sheetOffer([], { ...EMPTY_CONFIG, automationsEnabled: true, rules: [] }, candidate(9), opts)).toBeNull();
});

it("automations off: null", () => {
  expect(sheetOffer([], { ...cfg(rule()), automationsEnabled: false }, candidate(9), opts)).toBeNull();
});

it("D1 — the suggested product is already in the cart: null, not even locked", () => {
  const inCart = [{ id: "d", productId: "deep", unitPriceCents: 35000, currency: "NOK" as const, quantity: 1 }];
  expect(sheetOffer(inCart, cfg(rule()), candidate(1), opts)).toBeNull();
});

it("D2 — the suggested product is another supplier's: null", () => {
  expect(
    sheetOffer([], cfg(rule()), candidate(9), {
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
  expect(sheetOffer([], config, candidate(1), opts)).toBeNull(); // would be locked
  expect(sheetOffer([], config, candidate(9), opts)).toBeNull(); // would be unlocked
});
