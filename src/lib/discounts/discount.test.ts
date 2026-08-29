import { describe, it, expect } from "vitest";
import { money } from "@/lib/money/money";
import {
  computeCartDiscount,
  firstSuggestion,
  nextTier,
  tierFor,
  EMPTY_CONFIG,
  type DiscountConfig,
  type DiscountLineInput,
} from "./discount";

const TIERS = [
  { minQty: 4, pct: 5 },
  { minQty: 6, pct: 8 },
  { minQty: 8, pct: 10 },
  { minQty: 12, pct: 15 },
];

const config = (over: Partial<DiscountConfig> = {}): DiscountConfig => ({
  ...EMPTY_CONFIG,
  tiersEnabled: true,
  tiers: TIERS,
  ...over,
});

const line = (over: Partial<DiscountLineInput> & { id: string }): DiscountLineInput => ({
  productId: "plate",
  unitPriceCents: 74900,
  currency: "NOK",
  quantity: 1,
  ...over,
});

describe("tierFor / nextTier", () => {
  it("takes the HIGHEST tier the quantity reaches", () => {
    expect(tierFor(3, TIERS)).toBe(0);
    expect(tierFor(4, TIERS)).toBe(5);
    expect(tierFor(7, TIERS)).toBe(8);
    expect(tierFor(100, TIERS)).toBe(15);
  });

  it("nextTier is the next threshold up, or null at the top", () => {
    expect(nextTier(4, TIERS)).toEqual({ minQty: 6, pct: 8 });
    expect(nextTier(12, TIERS)).toBeNull();
  });

  it("ignores unsorted input and 0% rows", () => {
    const messy = [{ minQty: 8, pct: 10 }, { minQty: 4, pct: 0 }, { minQty: 6, pct: 8 }];
    expect(tierFor(4, messy)).toBe(0);
    expect(tierFor(9, messy)).toBe(10);
  });
});

describe("computeCartDiscount — quantity discounts", () => {
  it("aggregates the SAME product ACROSS designs and discounts every one of its lines", () => {
    // Alessio's own example: 4 Amalfi + 4 Striper of one plate = 8 → the ×8 tier.
    const lines = [
      line({ id: "a", quantity: 4 }),
      line({ id: "b", quantity: 4 }),
    ];
    const r = computeCartDiscount(lines, config());
    expect(r.qtyByProduct.plate).toBe(8);
    expect(r.perLine.a.pct).toBe(10);
    expect(r.perLine.b.pct).toBe(10);
    expect(r.perLine.a.saved).toEqual(money(29960)); // 10% of 4 × 749,00
    expect(r.total).toEqual(money(539280));
  });

  it("leaves other products at full price", () => {
    const lines = [
      line({ id: "a", quantity: 8 }),
      line({ id: "b", productId: "carafe", unitPriceCents: 120000, quantity: 1 }),
    ];
    const r = computeCartDiscount(lines, config());
    expect(r.perLine.a.pct).toBe(10);
    expect(r.perLine.b.pct).toBe(0);
    expect(r.perLine.b.source).toBe("none");
  });

  it("excluded products get no discount and do not count toward the aggregate", () => {
    const lines = [line({ id: "a", quantity: 8 })];
    const r = computeCartDiscount(lines, config({ includedProductIds: ["carafe"] }));
    expect(r.qtyByProduct.plate).toBeUndefined();
    expect(r.perLine.a.pct).toBe(0);
    expect(r.total).toEqual(money(599200));
  });

  it("an empty inclusion list means EVERY product is included", () => {
    const r = computeCartDiscount([line({ id: "a", quantity: 8 })], config());
    expect(r.perLine.a.pct).toBe(10);
  });

  it("gives nothing when the master switch is off", () => {
    const r = computeCartDiscount([line({ id: "a", quantity: 8 })], config({ tiersEnabled: false }));
    expect(r.perLine.a.pct).toBe(0);
    expect(r.tierSaved).toEqual(money(0));
    expect(r.total).toEqual(r.subtotal);
  });

  it("a line with no productId is never discounted (legacy/vanished product)", () => {
    const r = computeCartDiscount([line({ id: "a", productId: null, quantity: 8 })], config());
    expect(r.perLine.a.pct).toBe(0);
  });

  it("net + saved is exactly full on every line (no rounding drift)", () => {
    const lines = [line({ id: "a", quantity: 5, unitPriceCents: 33333 })];
    const r = computeCartDiscount(lines, config());
    const l = r.perLine.a;
    // 166 665 øre at 5% = 8 333,25 → 8 333 with ONE rounding on the line total.
    // A per-unit implementation would compute percentOf(33333,5)=1667 per piece
    // → 8 335, so this literal is what makes the drift test able to fail at all.
    expect(l.saved).toEqual(money(8333));
    expect(l.net.amountCents + l.saved.amountCents).toBe(l.full.amountCents);
  });

  it("an empty cart is 0 NOK everywhere, not a crash", () => {
    const r = computeCartDiscount([], config());
    expect(r.subtotal).toEqual(money(0));
    expect(r.total).toEqual(money(0));
  });
});

const RULE = {
  id: "r1",
  name: "Vietri upsell",
  triggerProductIds: ["plate"],
  triggerMinQty: 4,
  suggestedProductId: "boat",
  suggestedQty: 1,
  discountMode: "fixed" as const,
  discountPct: 15,
};

const opts = {
  dismissedRuleIds: [] as string[],
  supplierOf: () => "sup1",
  supplierOfProduct: () => "sup1",
};

describe("firstSuggestion", () => {
  const cfg = (over = {}) =>
    config({ automationsEnabled: true, rules: [RULE], ...over });

  it("fires once the trigger group reaches the minimum quantity", () => {
    expect(firstSuggestion([line({ id: "a", quantity: 3 })], cfg(), opts)).toBeNull();
    const s = firstSuggestion([line({ id: "a", quantity: 4 })], cfg(), opts);
    expect(s?.rule.id).toBe("r1");
    expect(s?.pct).toBe(15);
    expect(s?.fromLineId).toBe("a");
  });

  it("counts the group ACROSS lines and designs, like the tiers do", () => {
    const lines = [line({ id: "a", quantity: 2 }), line({ id: "b", quantity: 2 })];
    expect(firstSuggestion(lines, cfg(), opts)?.rule.id).toBe("r1");
  });

  it("never fires when the suggested product is already in the cart (D1)", () => {
    const lines = [line({ id: "a", quantity: 4 }), line({ id: "b", productId: "boat" })];
    expect(firstSuggestion(lines, cfg(), opts)).toBeNull();
  });

  it("never fires for a dismissed rule", () => {
    const s = firstSuggestion([line({ id: "a", quantity: 4 })], cfg(), {
      ...opts,
      dismissedRuleIds: ["r1"],
    });
    expect(s).toBeNull();
  });

  it("never fires across suppliers (D2)", () => {
    const s = firstSuggestion([line({ id: "a", quantity: 4 })], cfg(), {
      ...opts,
      supplierOfProduct: () => "sup2",
    });
    expect(s).toBeNull();
  });

  it("an EXCLUDED product never triggers a rule", () => {
    const s = firstSuggestion(
      [line({ id: "a", quantity: 4 })],
      cfg({ includedProductIds: ["carafe"] }),
      opts
    );
    expect(s).toBeNull();
  });

  it("returns ONE suggestion even when two rules match — the first by sort order", () => {
    const second = { ...RULE, id: "r2", suggestedProductId: "bowl" };
    expect(firstSuggestion([line({ id: "a", quantity: 4 })], cfg({ rules: [RULE, second] }), opts)?.rule.id).toBe("r1");
  });

  it("mode=inherited resolves to the group's current tier, and to 0 with the tiers off", () => {
    const inherited = { ...RULE, discountMode: "inherited" as const, discountPct: null };
    expect(firstSuggestion([line({ id: "a", quantity: 8 })], cfg({ rules: [inherited] }), opts)?.pct).toBe(10);
    expect(
      firstSuggestion([line({ id: "a", quantity: 8 })], cfg({ rules: [inherited], tiersEnabled: false }), opts)?.pct
    ).toBe(0);
  });

  it("a FIXED deal survives the tiers being switched off", () => {
    expect(firstSuggestion([line({ id: "a", quantity: 4 })], cfg({ tiersEnabled: false }), opts)?.pct).toBe(15);
  });

  it("gives nothing when automations are off", () => {
    expect(firstSuggestion([line({ id: "a", quantity: 4 })], cfg({ automationsEnabled: false }), opts)).toBeNull();
  });

  it("the donor line is filtered by inclusion too — an excluded line can't supply the config (review fix R1)", () => {
    // plate is included and alone crosses triggerMinQty; carafe is excluded and
    // contributes nothing to groupQty, but its raw quantity (100) is bigger, so
    // an inclusion-blind donor scan would wrongly pick it.
    const rule = { ...RULE, triggerProductIds: ["plate", "carafe"] };
    const lines = [
      line({ id: "a", productId: "plate", quantity: 4 }),
      line({ id: "b", productId: "carafe", quantity: 100 }),
    ];
    const s = firstSuggestion(
      lines,
      cfg({ rules: [rule], includedProductIds: ["plate"] }),
      opts
    );
    expect(s?.fromLineId).toBe("a");
  });

  it("a line with no productId is never a donor", () => {
    const lines = [
      line({ id: "a", productId: null, quantity: 4 }),
      line({ id: "b", productId: "plate", quantity: 4 }),
    ];
    const s = firstSuggestion(lines, cfg(), opts);
    expect(s?.fromLineId).toBe("b");
  });
});
