/**
 * R4-UPSELL-POST-ADD ②/③ — the offers as cards, in the post-add panel.
 *
 * This is where the panel's own contract is checked. `AddedSheet` itself cannot
 * be string-rendered — Radix portals its content and renders null on the
 * server, and this repo's unit setup has no DOM (vitest.config) — so what is
 * exercised here is the block the panel wraps, which is the half the card
 * actually changed. The shell around it (bottom sheet <640 / centred ≥640,
 * ✕ / Esc / backdrop, focus restore) is §3.19's, shared with `ProductSheet`,
 * and belongs to the e2e.
 *
 * The regression this file exists for: «Legg til 4+1». It is not a copy bug —
 * a block shown while the base is still hypothetical HAS to name two additions.
 * So the assertions are on the CONTENT of a card, never on a testid: a testid
 * survives a card that has gone blank or grown a second number back.
 *
 * Real dictionaries, both of them: a key this component asks for and NO or EN
 * does not have fails here too.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { SheetOfferBlock } from "@/components/ui-domain/sheet-offer-block";
import type { ActiveSuggestion, DiscountRule } from "@/lib/discounts/discount";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import en from "@/i18n/messages/en.json";
import no from "@/i18n/messages/no.json";

const SUGGESTED = {
  id: "bowl",
  slug: "bowl",
  nameNo: "Vietri bolle",
  nameEn: "Vietri bowl",
  priceCents: 59900,
  currency: "NOK" as const,
  image: null,
  pieces: 1,
  supplierId: "s1",
};

const rule: DiscountRule = {
  id: "r1",
  name: "post-add offer",
  triggerProductIds: ["plate"],
  triggerMinQty: 4,
  suggestedProductId: "bowl",
  suggestedQty: 2,
  discountMode: "fixed",
  discountPct: 15,
  suggested: SUGGESTED,
};

const offer: ActiveSuggestion = { rule, fromLineId: "line-1", pct: 15 };
const second: ActiveSuggestion = {
  rule: {
    ...rule,
    id: "r2",
    suggestedQty: 1,
    suggested: { ...SUGGESTED, id: "cup", nameNo: "Kopp", nameEn: "Cup" },
  },
  fromLineId: "line-1",
  pct: 10,
};

const full = multiply(money(SUGGESTED.priceCents, SUGGESTED.currency), rule.suggestedQty);
const net = subtract(full, percentOf(full, 15));

function render(
  offers: ActiveSuggestion[],
  takenRuleIds: string[] = [],
  locale: "no" | "en" = "en"
) {
  return renderToStaticMarkup(
    h(NextIntlClientProvider, {
      locale,
      messages: locale === "no" ? no : en,
      timeZone: "Europe/Oslo",
      children: h(SheetOfferBlock, { offers, locale, takenRuleIds, onTake: () => {} }),
    })
  );
}

const count = (html: string, testid: string) =>
  (html.match(new RegExp(`data-testid="${testid}"`, "g")) ?? []).length;

describe("a card", () => {
  const html = render([offer]);

  it("names the suggestion and how many of it", () => {
    expect(html).toContain("2 × Vietri bowl");
  });

  it("prices it: the full price struck through, the net beside it, the −% badge", () => {
    expect(html).toContain(formatMoney(full, "en"));
    expect(html).toContain(formatMoney(net, "en"));
    expect(formatMoney(net, "en")).not.toBe(formatMoney(full, "en")); // guards the fixture
    expect(html).toContain("−15%");
  });

  it("carries its own total on the button — one price, the one being paid", () => {
    expect(html).toContain(`Add · ${formatMoney(net, "en")}`);
  });

  it("never speaks of a bundle, in either language: the base is already in", () => {
    for (const s of [html, render([offer], [], "no")]) {
      expect(s).not.toContain("4+2");
      expect(s).not.toContain("2+"); // «Legg til 4+1» in every shape it took
      expect(s).not.toContain("Adds ");
      expect(s).not.toContain("Legger til ");
    }
  });

  it("is under the kicker the cart already uses for its own suggestions", () => {
    expect(html).toContain("Goes well with your set");
    expect(render([offer], [], "no")).toContain("Passer til settet ditt");
  });
});

describe("several offers", () => {
  it("one card each, in the order given — the admin's own", () => {
    const html = render([offer, second]);
    expect(count(html, "sheet-offer-row")).toBe(2);
    expect(count(html, "sheet-offer-add")).toBe(2);
    expect(html.indexOf("Vietri bowl")).toBeLessThan(html.indexOf("Cup"));
  });
});

describe("taking one", () => {
  const html = render([offer, second], [rule.id]);

  it("marks that card ✓ and takes its button away — a second tap is impossible", () => {
    expect(count(html, "sheet-offer-taken")).toBe(1);
    expect(count(html, "sheet-offer-add")).toBe(1); // the OTHER card, still open
  });

  it("keeps the taken card on screen, priced: the grid must not reshuffle", () => {
    expect(count(html, "sheet-offer-row")).toBe(2);
    expect(html).toContain("2 × Vietri bowl");
    expect(html).toContain(formatMoney(net, "en"));
  });

  it("says «added» to a screen reader, which sees no ✓", () => {
    expect(html).toContain("Added to the basket");
  });
});

it("nothing to offer → no node at all, so the panel is the confirmation alone", () => {
  expect(render([])).toBe("");
});

it("an offer with no drawable card is dropped, not drawn blank", () => {
  const orphan: ActiveSuggestion = {
    rule: { ...rule, id: "r3", suggested: undefined },
    fromLineId: "line-1",
    pct: 15,
  };
  const html = render([orphan, offer]);
  expect(count(html, "sheet-offer-row")).toBe(1);
});
