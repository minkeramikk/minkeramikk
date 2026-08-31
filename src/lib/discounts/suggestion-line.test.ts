import { describe, it, expect } from "vitest";
import type { CartLine } from "@/lib/cart/cart";
import type { ActiveSuggestion, DiscountRule } from "./discount";
import { buildSuggestionLine } from "./suggestion-line";

const RULE: DiscountRule = {
  id: "r1",
  name: "Vietri upsell",
  triggerProductIds: ["plate"],
  triggerMinQty: 4,
  suggestedProductId: "boat",
  suggestedQty: 2,
  discountMode: "fixed",
  discountPct: 15,
  suggested: {
    id: "boat",
    slug: "sauce-boat",
    nameNo: "Sausenebbe",
    nameEn: "Sauce boat",
    priceCents: 39900,
    currency: "NOK",
    image: "https://cdn.example.com/boat.jpg",
    pieces: 1,
    supplierId: "sup1",
  },
};

const FROM_LINE: CartLine = {
  id: "plate::code-abc",
  productId: "plate",
  productNameNo: "Tallerken",
  productNameEn: "Plate",
  supplierId: "sup1",
  supplierName: "Vietri",
  unitPriceCents: 74900,
  currency: "NOK",
  quantity: 4,
  configCode: "code-abc",
  configSnapshot: {
    designSlug: "olive",
    designName: "Olive",
    selections: [{ label: "Farge", option: "Grønn", hex: "#4a5d3a" }],
  },
  layers: [{ src: "https://cdn.example.com/olive-pattern.png", recolor: true }],
  plateImage: "https://cdn.example.com/plate.jpg",
  productSlug: "plate-classic",
  pieces: 1,
};

const SUGGESTION: ActiveSuggestion = { rule: RULE, fromLineId: FROM_LINE.id, pct: 15 };

describe("buildSuggestionLine", () => {
  it("inherits configCode, snapshot and layers from the TRIGGERING line", () => {
    const line = buildSuggestionLine(SUGGESTION, FROM_LINE);
    expect(line?.configCode).toBe(FROM_LINE.configCode);
    expect(line?.configSnapshot).toBe(FROM_LINE.configSnapshot);
    expect(line?.layers).toBe(FROM_LINE.layers);
  });

  it("takes product identity, price, slug, pieces and plate photo from rule.suggested", () => {
    const line = buildSuggestionLine(SUGGESTION, FROM_LINE);
    expect(line?.productId).toBe("boat");
    expect(line?.productNameNo).toBe("Sausenebbe");
    expect(line?.productNameEn).toBe("Sauce boat");
    expect(line?.unitPriceCents).toBe(39900);
    expect(line?.currency).toBe("NOK");
    expect(line?.productSlug).toBe("sauce-boat");
    expect(line?.pieces).toBe(1);
    expect(line?.plateImage).toBe("https://cdn.example.com/boat.jpg");
    expect(line?.quantity).toBe(2); // suggestedQty, not the trigger line's quantity
  });

  it("sets dealRuleId and carries no percentage or amount anywhere on the line", () => {
    const line = buildSuggestionLine(SUGGESTION, FROM_LINE);
    expect(line?.dealRuleId).toBe("r1");
    const keys = Object.keys(line ?? {});
    for (const k of keys) {
      expect(k.toLowerCase()).not.toMatch(/pct|percent|discount|saved|amount/);
    }
  });

  it("returns null when the rule's suggested product failed to resolve", () => {
    const broken: ActiveSuggestion = {
      rule: { ...RULE, suggested: undefined },
      fromLineId: FROM_LINE.id,
      pct: 15,
    };
    expect(buildSuggestionLine(broken, FROM_LINE)).toBeNull();
  });

  it("accepts a donor that is not in the cart yet — no cast, no fake id", () => {
    const donor = {
      supplierId: "s1",
      supplierName: "Vietri",
      configCode: "MK-X",
      configSnapshot: null,
      layers: [{ src: "a.png" }],
    };
    const line = buildSuggestionLine(SUGGESTION, donor);
    expect(line?.configCode).toBe("MK-X");
    expect(line?.supplierId).toBe("s1");
    expect(line?.dealRuleId).toBe(SUGGESTION.rule.id);
    // and still nothing about price travels on the line
    expect(
      Object.keys(line ?? {}).some((k) => /pct|percent|discount|saved|amount/i.test(k))
    ).toBe(false);
  });
});
