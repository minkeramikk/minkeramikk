/**
 * R4-UPSELL-POST-ADD ① — the scale as a STEP TABLE.
 *
 * What the assertions defend is the table's own contract, the part `ladderFor`
 * cannot express: the «1 stk / 0 %» baseline column the engine knows nothing
 * about, which single column carries the highlight, where «Mest valgt» sits,
 * and that a press aims the SELECTOR at `minQty − inCart` rather than adding
 * anything. Plus the negative: no bar, no dots, no «Du sparer», no nudge.
 *
 * `renderToStaticMarkup` rather than a DOM — the component is pure, props in,
 * markup out — with the REAL en.json, so a key it asks for and the dictionary
 * does not have fails here too.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { DiscountLadder, stepTargetQty } from "@/components/ui-domain/discount-ladder";
import { ladderFor } from "@/lib/discounts/ladder";
import en from "@/i18n/messages/en.json";

/** The scale actually live on PROD — the one AC1 is written against. */
const PROD = [
  { minQty: 4, pct: 5 },
  { minQty: 6, pct: 8 },
  { minQty: 8, pct: 10 },
  { minQty: 10, pct: 15 },
  { minQty: 12, pct: 20 },
];

function render(qty: number, inCart = 0, onSetQty: (n: number) => void = () => {}) {
  return renderToStaticMarkup(
    h(NextIntlClientProvider, {
      locale: "en",
      messages: en,
      timeZone: "Europe/Oslo",
      children: h(DiscountLadder, {
        ladder: ladderFor(qty, PROD),
        excluded: false,
        inCart,
        onSetQty,
      }),
    })
  );
}

/** The columns, in order, as `data-testid` + whether they carry the highlight. */
function columns(html: string) {
  return [...html.matchAll(/<button[^>]*data-testid="(ladder-step(?:-base)?)"[^>]*>/g)].map((m) => ({
    testid: m[1],
    current: m[0].includes('aria-current="step"'),
    disabled: m[0].includes("disabled"),
  }));
}

describe("the columns", () => {
  it("opens on «1 stk / 0 %» — the baseline the engine does not know about", () => {
    const html = render(1);
    const cols = columns(html);
    expect(cols).toHaveLength(6); // baseline + the five PROD tiers
    expect(cols[0].testid).toBe("ladder-step-base");
    expect(cols.slice(1).map((c) => c.testid)).toEqual(Array(5).fill("ladder-step"));
    expect(html).toContain("1 pcs");
    expect(html).toContain("0%");
    expect(html).toContain("4 pcs");
    expect(html).toContain("−5%");
    expect(html).toContain("12 pcs");
    expect(html).toContain("−20%");
  });

  it("«Most chosen» sits on the first tier, never on the baseline", () => {
    // The tag is rendered inside its own column, so the marked column is the
    // one whose markup carries it: split on the buttons and look at index 1.
    const cells = render(1).split('<button').slice(1);
    expect(cells[0]).not.toContain("Most chosen"); // 1 stk
    expect(cells[1]).toContain("Most chosen"); // 4 stk — the first tier
    expect(cells.slice(2).join("")).not.toContain("Most chosen");
  });
});

describe("which column is the current one", () => {
  it("below the first tier: the baseline, and nothing else", () => {
    const cols = columns(render(3));
    expect(cols.filter((c) => c.current)).toHaveLength(1);
    expect(cols[0].current).toBe(true);
  });

  it("on a tier exactly: that tier", () => {
    const cols = columns(render(6));
    expect(cols.map((c) => c.current)).toEqual([false, false, true, false, false, false]);
  });

  it("BETWEEN two tiers: the one earned, not the one aimed at", () => {
    // 7 pieces earn −8 % (the 6 step). A table that highlights nothing here —
    // or highlights 8 — misprices what the customer is looking at.
    const cols = columns(render(7));
    expect(cols.map((c) => c.current)).toEqual([false, false, true, false, false, false]);
  });

  it("past the last tier: the top one stays lit", () => {
    const cols = columns(render(30));
    expect(cols.at(-1)!.current).toBe(true);
  });

  it("the current column is the only one that is not pressable", () => {
    const cols = columns(render(6));
    expect(cols.filter((c) => c.disabled).map((c) => c.testid)).toEqual(["ladder-step"]);
  });
});

describe("pressing a column", () => {
  it("aims the SELECTOR at the step, counting what is already in the basket", () => {
    expect(stepTargetQty(8, 0)).toBe(8);
    expect(stepTargetQty(8, 3)).toBe(5); // 3 already in the basket → 5 more
  });

  it("never asks for less than one", () => {
    expect(stepTargetQty(4, 10)).toBe(1);
  });
});

it("says nothing beyond the title, the columns and the note", () => {
  const html = render(7, 3);
  expect(html).toContain("Buy more – save more");
  expect(html).toContain("The discount is applied automatically in the basket.");
  expect(html).toContain("3 pcs in basket"); // the pill, not the grey paragraph
  // The copy this card deleted, in every form it took:
  expect(html).not.toContain("You save");
  expect(html).not.toContain("Save up to");
  expect(html).not.toContain("more, and you save");
  expect(html).not.toContain("Best discount reached");
  expect(html).not.toContain("are in the basket");
  expect(html).not.toContain("ladder-save");
  expect(html).not.toContain("ladder-nudge");
  expect(html).not.toContain("ladder-sticky-hint");
});

it("no basket, no pill", () => {
  expect(render(1, 0)).not.toContain("ladder-in-cart");
});

it("no scale → no frame at all; excluded → one line and nothing else", () => {
  const empty = renderToStaticMarkup(
    h(NextIntlClientProvider, {
      locale: "en",
      messages: en,
      timeZone: "Europe/Oslo",
      children: h(DiscountLadder, { ladder: null, excluded: false, inCart: 0, onSetQty: () => {} }),
    })
  );
  expect(empty).toBe("");

  const excluded = renderToStaticMarkup(
    h(NextIntlClientProvider, {
      locale: "en",
      messages: en,
      timeZone: "Europe/Oslo",
      children: h(DiscountLadder, { ladder: ladderFor(4, PROD), excluded: true, inCart: 0, onSetQty: () => {} }),
    })
  );
  expect(excluded).toContain("not part of the quantity discount");
  expect(excluded).not.toContain("ladder-step");
});
