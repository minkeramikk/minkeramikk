/**
 * The regression this file exists for: the locked band used to say «Add 3 more
 * to unlock» and NOTHING else — effort asked, prize unnamed. So the assertions
 * are on the CONTENT of the row (the suggested product's name, its full price,
 * its discounted price, the −% badge), never on a testid: a testid can survive
 * a row that has gone blank.
 *
 * Rendered with `renderToStaticMarkup` rather than a DOM: the block is pure —
 * props in, markup out, no effects, no events under test — so a string is
 * enough, and it costs the repo no jsdom and no testing-library. The messages
 * are the REAL en.json, so a key this component asks for and the dictionary
 * does not have fails here too.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { SheetOfferBlock } from "@/components/ui-domain/sheet-offer-block";
import type { DiscountRule } from "@/lib/discounts/discount";
import type { SheetOffer } from "@/lib/discounts/sheet-offer";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import en from "@/i18n/messages/en.json";

const SUGGESTED = {
  id: "deep",
  slug: "deep",
  nameNo: "Dyp tallerken",
  nameEn: "Deep plate",
  priceCents: 35000,
  currency: "NOK" as const,
  image: null,
  pieces: 1,
  supplierId: "s1",
};

const rule: DiscountRule = {
  id: "r1",
  name: "sheet offer",
  triggerProductIds: ["plate"],
  triggerMinQty: 6,
  suggestedProductId: "deep",
  suggestedQty: 2,
  discountMode: "fixed",
  discountPct: 20,
  suggested: SUGGESTED,
};

const lockedOffer: SheetOffer = {
  kind: "locked",
  suggestion: { rule, fromLineId: "candidate", pct: 20 },
  neededQty: 6,
  missing: 4,
  selfOffer: false,
};

function render(offers: SheetOffer[]) {
  return renderToStaticMarkup(
    h(
      NextIntlClientProvider,
      { locale: "en", messages: en },
      h(SheetOfferBlock, {
        offers,
        currentName: "Flat plate",
        locale: "en" as const,
        takenRuleIds: [],
        onSetQty: () => {},
        onTake: () => {},
      })
    )
  );
}

const full = multiply(money(SUGGESTED.priceCents, SUGGESTED.currency), rule.suggestedQty);
const net = subtract(full, percentOf(full, 20));

describe("the locked row", () => {
  const html = render([lockedOffer]);

  it("names the product being unlocked, and how many of it", () => {
    expect(html).toContain(SUGGESTED.nameEn);
    expect(html).toContain("2 ×"); // cart.suggestion.qtyName, as the unlocked row draws it
  });

  it("prices it: the full price AND the discounted one, both on screen", () => {
    expect(html).toContain(formatMoney(full, "en"));
    expect(html).toContain(formatMoney(net, "en"));
    expect(formatMoney(net, "en")).not.toBe(formatMoney(full, "en")); // guards the fixture
  });

  it("shows the −% badge", () => {
    expect(html).toContain("20");
  });

  it("asks for the missing pieces and states the threshold", () => {
    expect(html).toContain("Add 4 more"); // the button: raises the quantity, adds nothing
    expect(html).toContain("At 6 in total"); // the threshold, not whatBoth/whatOnly
  });

  it("does not describe an add the locked button will not do", () => {
    expect(html).not.toContain("Adds ");
  });

  it("keeps the muted kicker, so locked stays distinguishable from unlocked", () => {
    expect(html).toContain("Offer");
    expect(html).not.toContain("Offer unlocked");
    expect(html).toContain("var(--muted)");
  });
});

it("an empty list renders no band at all", () => {
  expect(render([])).toBe("");
});

it("the unlocked row still draws its own copy, unchanged", () => {
  const html = render([
    { kind: "unlocked", suggestion: { rule, fromLineId: "candidate", pct: 20 }, baseQty: 6, selfOffer: false },
  ]);
  expect(html).toContain("Offer unlocked");
  expect(html).toContain(SUGGESTED.nameEn);
  expect(html).toContain(formatMoney(net, "en"));
  expect(html).toContain("Adds 6 Flat plate + 2 Deep plate");
  expect(html).not.toContain("At 6 in total");
});
