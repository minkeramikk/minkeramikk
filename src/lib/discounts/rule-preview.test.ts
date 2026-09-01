import { describe, it, expect } from "vitest";
import { formatMoney, money } from "@/lib/money/money";
import { rulePreview } from "./rule-preview";

const base = {
  triggerMinQty: 4,
  suggestedQty: 4,
  suggestedName: "Deep plate",
  discountMode: "fixed" as const,
  discountPct: 50,
  suggestedPriceCents: 74900,
  currency: "NOK" as const,
};
// Derived, never hardcoded: if the formatter changes, the test follows it
// instead of lying about what it checks.
const kr = (cents: number) => formatMoney(money(cents), "no");

describe("rulePreview — the admin reads the rule in plain English", () => {
  it("a fixed deal spells out quantity, percentage AND the amount", () => {
    expect(rulePreview(base)).toBe(
      `With 4 in the basket the customer gets 4 more at −50% (−${kr(149800)}).`
    );
  });

  it("an aggressive rule reads as aggressive — nothing is softened", () => {
    expect(rulePreview({ ...base, triggerMinQty: 1, suggestedQty: 10 })).toBe(
      `With 1 in the basket the customer gets 10 more at −50% (−${kr(374500)}).`
    );
  });

  it("an inherited deal cannot name a percentage, and says so", () => {
    expect(
      rulePreview({ ...base, discountMode: "inherited", discountPct: null })
    ).toBe(
      "With 4 in the basket the customer gets 4 more at the quantity discount the trigger group earns."
    );
  });

  it("mode 'none' suggests without discounting", () => {
    expect(rulePreview({ ...base, discountMode: "none", discountPct: null })).toBe(
      "With 4 in the basket the customer is suggested 4 more at full price."
    );
  });

  it("an unknown price still gives a sentence, just without the amount", () => {
    expect(rulePreview({ ...base, suggestedPriceCents: null })).toBe(
      "With 4 in the basket the customer gets 4 more at −50%."
    );
  });

  it("a rule that is not one yet: no line at all", () => {
    expect(rulePreview({ ...base, suggestedName: "" })).toBeNull();
    expect(rulePreview({ ...base, discountPct: null })).toBeNull();
    expect(rulePreview({ ...base, suggestedQty: 0 })).toBeNull();
  });
});
