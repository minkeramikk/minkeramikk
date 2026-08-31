import { describe, it, expect } from "vitest";
import { money, subtract } from "@/lib/money/money";
import {
  cartSaved,
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

describe("computeCartDiscount — deal entitlement (I1/I2 fix-wave)", () => {
  const cfg = () => config({ automationsEnabled: true, rules: [RULE] });

  it("a legitimate deal line with its trigger present keeps its percentage", () => {
    const lines = [
      line({ id: "a", productId: "plate", quantity: 4 }),
      line({ id: "b", productId: "boat", quantity: 1, dealRuleId: "r1" }),
    ];
    const r = computeCartDiscount(lines, cfg());
    expect(r.perLine.b.pct).toBe(15);
    expect(r.perLine.b.source).toBe("deal");
  });

  it("I1 — a fixed deal line whose trigger line has been removed resolves to 0", () => {
    // the plate that triggered the deal is gone; only the boat line remains,
    // still carrying the dealRuleId from when the trigger was present.
    const lines = [line({ id: "b", productId: "boat", quantity: 1, dealRuleId: "r1" })];
    const r = computeCartDiscount(lines, cfg());
    expect(r.perLine.b.pct).toBe(0);
    expect(r.perLine.b.source).toBe("none");
  });

  it("I2 — a line carrying a dealRuleId for a rule that suggests a different product gets no discount", () => {
    // trigger genuinely satisfied by a separate plate ×4 line (no dealRuleId);
    // a THIRD, non-suggested product (carafe) carries the forged/mismatched
    // dealRuleId. Only the entitlement guard can zero it — the trigger guard
    // already passed — so this proves the guard independently of I1.
    const lines = [
      line({ id: "a", productId: "plate", quantity: 4 }),
      line({ id: "c", productId: "carafe", unitPriceCents: 120000, quantity: 1, dealRuleId: "r1" }),
    ];
    const r = computeCartDiscount(lines, cfg());
    expect(r.perLine.c.pct).toBe(0);
    expect(r.perLine.c.source).toBe("none");
  });

  it("inherited mode still resolves to the group's current tier via computeCartDiscount", () => {
    const inherited = { ...RULE, discountMode: "inherited" as const, discountPct: null };
    const lines = [
      line({ id: "a", productId: "plate", quantity: 8 }),
      line({ id: "b", productId: "boat", quantity: 1, dealRuleId: "r1" }),
    ];
    const r = computeCartDiscount(lines, config({ automationsEnabled: true, rules: [inherited] }));
    expect(r.perLine.b.pct).toBe(10);
    expect(r.perLine.b.source).toBe("deal");
  });
});

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

describe("a deal covers at most suggestedQty pieces (ADR 0023)", () => {
  // «4 × Deep plate at 50%» is an offer on FOUR pieces. Before the cap it was a
  // 50% licence on the line: accept the suggestion, raise the quantity, and the
  // whole line went half price. Unit price 35000 øre, so the offer is worth
  // 50% of 4 × 35000 = 70000 øre — and that number must not move.
  const OFFER = {
    ...RULE,
    suggestedProductId: "plate2",
    suggestedQty: 4,
    discountPct: 50,
  };
  const cfg = config({ automationsEnabled: true, rules: [OFFER], tiersEnabled: false });
  const cart = (qty: number) => [
    line({ id: "trigger", quantity: 4 }), // satisfies triggerMinQty
    line({ id: "deal", productId: "plate2", unitPriceCents: 35000, quantity: qty, dealRuleId: "r1" }),
  ];

  it("at exactly suggestedQty: the whole line is covered", () => {
    const d = computeCartDiscount(cart(4), cfg).perLine.deal;
    expect(d.source).toBe("deal");
    expect(d.saved).toEqual(money(70000));
    expect(d.coveredQty).toBe(4);
    expect(d.quantity).toBe(4);
    expect(d.net).toEqual(money(70000)); // 140000 − 70000
  });

  it("BELOW suggestedQty: only the pieces actually in the cart are covered", () => {
    const d = computeCartDiscount(cart(2), cfg).perLine.deal;
    expect(d.saved).toEqual(money(35000)); // 50% of 2 × 35000
    expect(d.coveredQty).toBe(2);
  });

  it("ABOVE suggestedQty: the saving stops at the offer, the extra is full price", () => {
    const d = computeCartDiscount(cart(20), cfg).perLine.deal;
    expect(d.saved).toEqual(money(70000)); // identical to the qty-4 case
    expect(d.coveredQty).toBe(4);
    expect(d.quantity).toBe(20);
    // the 16 uncovered pieces are charged in full
    expect(d.net).toEqual(money(20 * 35000 - 70000));
    // and the invariant the whole engine rests on still holds
    expect(d.net.amountCents + d.saved.amountCents).toBe(d.full.amountCents);
  });

  it("a TIER is not capped — the scale is earned by the whole line", () => {
    const tiered = computeCartDiscount(
      [line({ id: "a", quantity: 8 })],
      config({ tiersEnabled: true })
    ).perLine.a;
    expect(tiered.source).toBe("tier");
    expect(tiered.coveredQty).toBe(8);
    expect(tiered.coveredQty).toBe(tiered.quantity);
  });
});

describe("tierEligible — the single source of truth for the tier nudge", () => {
  it("is false when the tiers are switched off, even with the scale still in the table", () => {
    // How the shop actually switches off: /admin/discounts flips the flag and
    // LEAVES the rows (an empty scale is refused by saveDiscountTiers). The
    // server loads `tiers` regardless, so the nudge must ask, not re-derive.
    const d = computeCartDiscount(
      [line({ id: "a", quantity: 2 })],
      config({ tiersEnabled: false, tiers: [{ minQty: 2, pct: 12 }, { minQty: 9, pct: 20 }] })
    ).perLine.a;
    expect(d.pct).toBe(0);
    expect(d.tierEligible).toBe(false);
  });

  it("is false for a product outside the inclusion multi-select", () => {
    const d = computeCartDiscount(
      [line({ id: "a", quantity: 8 })],
      config({ includedProductIds: ["carafe"] })
    ).perLine.a;
    expect(d.tierEligible).toBe(false);
  });

  it("is false on a line already carrying a deal — the tier would contradict the offer", () => {
    const OFFER = { ...RULE, suggestedProductId: "plate2", suggestedQty: 4, discountPct: 50 };
    const d = computeCartDiscount(
      [
        line({ id: "trigger", quantity: 4 }),
        line({ id: "deal", productId: "plate2", quantity: 4, dealRuleId: "r1" }),
      ],
      config({ automationsEnabled: true, rules: [OFFER], tiersEnabled: true })
    ).perLine.deal;
    expect(d.source).toBe("deal");
    expect(d.tierEligible).toBe(false);
  });

  it("is true on an ordinary eligible line, below the first tier or above it", () => {
    const r = computeCartDiscount(
      [line({ id: "a", quantity: 1 }), line({ id: "b", productId: "other", quantity: 8 })],
      config({ tiersEnabled: true })
    );
    expect(r.perLine.a.tierEligible).toBe(true); // below the scale: the nudge still invites
    expect(r.perLine.b.tierEligible).toBe(true);
  });
});

describe("cartSaved — what the sticky bar declares", () => {
  const run = (lines: DiscountLineInput[], c: DiscountConfig) =>
    cartSaved(computeCartDiscount(lines, c));

  it("is zero when nothing is discounted", () => {
    expect(run([line({ id: "a", quantity: 1 })], EMPTY_CONFIG)).toEqual(money(0));
  });

  it("counts a tier", () => {
    // 8 × 74900 = 599200, the ×8 step is 10%
    expect(run([line({ id: "a", quantity: 8 })], config({ tiersEnabled: true }))).toEqual(
      money(59920)
    );
  });

  it("counts a deal", () => {
    const OFFER = { ...RULE, suggestedProductId: "plate2", suggestedQty: 4, discountPct: 50 };
    const saved = run(
      [
        line({ id: "trigger", quantity: 4 }),
        line({ id: "deal", productId: "plate2", unitPriceCents: 35000, quantity: 4, dealRuleId: "r1" }),
      ],
      config({ automationsEnabled: true, rules: [OFFER], tiersEnabled: false })
    );
    expect(saved).toEqual(money(70000)); // 50% of 4 × 35000
  });

  it("counts a tier and a deal TOGETHER — the bar shows one number", () => {
    const OFFER = { ...RULE, suggestedProductId: "plate2", suggestedQty: 4, discountPct: 50 };
    const r = computeCartDiscount(
      [
        line({ id: "trigger", quantity: 8 }), // earns the ×8 tier: 10% of 599200 = 59920
        line({ id: "deal", productId: "plate2", unitPriceCents: 35000, quantity: 4, dealRuleId: "r1" }),
      ],
      config({ automationsEnabled: true, rules: [OFFER], tiersEnabled: true })
    );
    expect(r.tierSaved).toEqual(money(59920));
    expect(r.dealSaved).toEqual(money(70000));
    // the bar must not show one of the two, nor their sum computed twice
    expect(cartSaved(r)).toEqual(money(129920));
    expect(cartSaved(r)).toEqual(subtract(r.subtotal, r.total));
  });
});
