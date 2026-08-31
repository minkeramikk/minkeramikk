import { describe, it, expect } from "vitest";
import { money, subtract } from "@/lib/money/money";
import {
  cartSaved,
  computeCartDiscount,
  activeSuggestions,
  MAX_SUGGESTIONS,
  nextTier,
  tierFor,
  EMPTY_CONFIG,
  type DiscountConfig,
  type DiscountLineInput,
  type DiscountRule,
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

describe("activeSuggestions — a list, in the admin's order", () => {
  const opts = {
    supplierOf: () => "sup1",
    supplierOfProduct: () => "sup1",
  };
  // Rules differ only by the product they suggest, so precedence can only come
  // from their ORDER in config.rules — if a test passes because one of them is
  // "better", the engine has grown a heuristic it must not have.
  const ruleFor = (id: string, suggested: string): DiscountRule => ({
    ...RULE,
    id,
    suggestedProductId: suggested,
  });
  const cfg = (rules: DiscountRule[]) =>
    config({ automationsEnabled: true, rules, tiersEnabled: false });
  const trigger = [line({ id: "t", quantity: RULE.triggerMinQty })];

  it("no candidate: an empty list, never null", () => {
    expect(activeSuggestions(trigger, cfg([]), opts)).toEqual([]);
    // trigger not yet satisfied
    expect(
      activeSuggestions(
        [line({ id: "t", quantity: RULE.triggerMinQty - 1 })],
        cfg([ruleFor("r1", "boat")]),
        opts
      )
    ).toEqual([]);
  });

  it("one candidate: one offer", () => {
    const out = activeSuggestions(trigger, cfg([ruleFor("r1", "boat")]), opts);
    expect(out).toHaveLength(1);
    expect(out[0].rule.id).toBe("r1");
  });

  it("three candidates: three offers, in the admin's order", () => {
    const rules = [ruleFor("r1", "boat"), ruleFor("r2", "bowl"), ruleFor("r3", "mug")];
    const out = activeSuggestions(trigger, cfg(rules), opts);
    expect(out.map((o) => o.rule.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("more than the cap: the first MAX_SUGGESTIONS only, the rest silently unshown", () => {
    const rules = Array.from({ length: MAX_SUGGESTIONS + 2 }, (_, i) =>
      ruleFor(`r${i}`, `p${i}`)
    );
    const out = activeSuggestions(trigger, cfg(rules), opts);
    expect(out).toHaveLength(MAX_SUGGESTIONS);
    expect(out.map((o) => o.rule.id)).toEqual(
      rules.slice(0, MAX_SUGGESTIONS).map((r) => r.id)
    );
  });

  it("keeps the filters it always had: in-cart (D1), cross-supplier (D2), excluded", () => {
    const rules = [ruleFor("r1", "boat")];
    // D1 — already in the cart
    expect(
      activeSuggestions([...trigger, line({ id: "b", productId: "boat" })], cfg(rules), opts)
    ).toEqual([]);
    // D2 — the suggested product belongs to another supplier
    expect(
      activeSuggestions(trigger, cfg(rules), { ...opts, supplierOfProduct: () => "sup2" })
    ).toEqual([]);
    // excluded products never trigger
    expect(
      activeSuggestions(trigger, config({ automationsEnabled: true, rules, includedProductIds: ["other"] }), opts)
    ).toEqual([]);
  });

  describe("which line donates the design", () => {
    const rules = [ruleFor("r1", "boat")];
    const cart = [
      line({ id: "big", quantity: 8, configCode: "MK-AMALFI" }),
      line({ id: "small", quantity: 2, configCode: "MK-JULETRE" }),
    ];

    it("with no current configuration: the biggest trigger line, as before", () => {
      const [out] = activeSuggestions(cart, cfg(rules), opts);
      expect(out.fromLineId).toBe("big");
    });

    it("with a current configuration that matches: that line, even if smaller", () => {
      const [out] = activeSuggestions(cart, cfg(rules), {
        ...opts,
        currentConfigCode: "MK-JULETRE",
      });
      expect(out.fromLineId).toBe("small");
    });

    it("with a current configuration nothing matches: back to the biggest", () => {
      const [out] = activeSuggestions(cart, cfg(rules), {
        ...opts,
        currentConfigCode: "MK-NOT-IN-CART",
      });
      expect(out.fromLineId).toBe("big");
    });
  });
});


describe("an offer is owed on exactly its own size — both edges (ADR 0023)", () => {
  // Every expectation below is DERIVED from these three, so a reviewer can
  // change them and the tests still hold. If editing a fixture breaks a test,
  // a value was hardcoded and the test is lying about what it checks.
  const UNIT = 35000;
  const saving = (q: number, pct: number) => money(Math.round((UNIT * q * pct) / 100));

  const offer = (over: Partial<DiscountRule> = {}): DiscountRule => ({
    ...RULE,
    suggestedProductId: "plate2",
    ...over,
  });
  const cfgFor = (rule: DiscountRule, over: Partial<DiscountConfig> = {}) =>
    config({ automationsEnabled: true, rules: [rule], tiersEnabled: false, ...over });
  const cart = (qty: number) => [
    line({ id: "trigger", quantity: RULE.triggerMinQty }), // trigger always satisfied
    line({ id: "deal", productId: "plate2", unitPriceCents: UNIT, quantity: qty, dealRuleId: RULE.id }),
  ];

  describe.each([
    ["fixed", offer({ suggestedQty: 4, discountMode: "fixed", discountPct: 50 }), 50, {}],
    ["fixed, a different offer entirely", offer({ suggestedQty: 3, discountMode: "fixed", discountPct: 20 }), 20, {}],
    // `inherited` takes its percentage from the trigger group's current tier:
    // the group holds RULE.triggerMinQty (4) pieces, which the scale prices at 5%.
    ["inherited", offer({ suggestedQty: 2, discountMode: "inherited", discountPct: null }), tierFor(RULE.triggerMinQty, TIERS), { tiersEnabled: true }],
  ])("%s", (_label, rule, pct, cfgOver) => {
    const q = rule.suggestedQty;
    const cfg = cfgFor(rule, cfgOver);

    it("BELOW the offer: no deal at all, the line falls through to the ordinary path", () => {
      const d = computeCartDiscount(cart(q - 1), cfg).perLine.deal;
      expect(d.source).not.toBe("deal");
      expect(d.saved).toEqual(money(0));
      // and the customer is told what is missing, in the RULE's own numbers
      expect(d.pendingDeal).toEqual({ missing: 1, pct });
    });

    it("EXACTLY at the offer: the whole line is covered", () => {
      const d = computeCartDiscount(cart(q), cfg).perLine.deal;
      expect(d.source).toBe("deal");
      expect(d.saved).toEqual(saving(q, pct));
      expect(d.coveredQty).toBe(q);
      expect(d.pendingDeal).toBeUndefined();
    });

    it("ABOVE the offer: the saving stops at the offer, the extra is full price", () => {
      const above = q + 7;
      const d = computeCartDiscount(cart(above), cfg).perLine.deal;
      expect(d.source).toBe("deal");
      expect(d.saved).toEqual(saving(q, pct)); // identical to the exact case
      expect(d.coveredQty).toBe(q);
      expect(d.quantity).toBe(above);
      expect(d.net.amountCents + d.saved.amountCents).toBe(d.full.amountCents);
    });
  });

  it("suggestedQty 1 (a presence rule): any quantity >= 1 clears the floor", () => {
    const rule = offer({ suggestedQty: 1, discountMode: "fixed", discountPct: 30 });
    const cfg = cfgFor(rule);
    for (const qty of [1, 2, 9]) {
      const d = computeCartDiscount(cart(qty), cfg).perLine.deal;
      expect(d.source).toBe("deal");
      expect(d.saved).toEqual(saving(1, 30)); // one piece, always
      expect(d.pendingDeal).toBeUndefined();
    }
  });

  it("below the floor the line still earns its TIER — the fallback already existed", () => {
    // A rule that wants more pieces than the cart holds: no deal, and the line
    // carries on down the ordinary tier branch rather than to full price.
    const hungry = offer({ suggestedQty: 99, discountMode: "fixed", discountPct: 50 });
    const d = computeCartDiscount(
      cart(8),
      cfgFor(hungry, { tiersEnabled: true })
    ).perLine.deal;
    expect(d.source).toBe("tier");
    expect(d.pct).toBe(tierFor(8, TIERS));
    expect(d.pendingDeal?.missing).toBe(99 - 8);
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
