/**
 * R5-FEEDBACK-UX AC2 — «Om designet» on mobile: cut text gets «Les mer».
 *
 * No DOM in this repo's unit setup (vitest.config), so two halves:
 *  - `clampHidesText`, the decision. The bug was the 0/0 case: the tab panel
 *    is `display:none` at mount, so the one measurement said «fits» for good.
 *    That a ResizeObserver re-measures when the panel shows is the component's
 *    wiring, not checkable here — evidence on the PR.
 *  - the collapsed markup: clamped to 3 lines below `sm`, full above.
 * Real dictionaries: «Les mer» / «Vis mindre» are the client's words.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { DesignDescription, clampHidesText } from "./design-description";
import en from "@/i18n/messages/en.json";
import no from "@/i18n/messages/no.json";

describe("clampHidesText", () => {
  it("text taller than its 3-line box is cut", () => {
    expect(clampHidesText({ scrollHeight: 182, clientHeight: 68 })).toBe(true);
  });
  it("text that fits is not", () => {
    expect(clampHidesText({ scrollHeight: 68, clientHeight: 68 })).toBe(false);
  });
  it("a hidden panel (0/0) says nothing — it must be measured again when shown", () => {
    expect(clampHidesText({ scrollHeight: 0, clientHeight: 0 })).toBe(false);
  });
});

describe("DesignDescription", () => {
  it("collapsed: 3 lines on mobile, full text from sm", () => {
    const html = renderToStaticMarkup(
      h(
        NextIntlClientProvider,
        { locale: "no", messages: no },
        h(DesignDescription, { text: "Sitroner fra Amalfi." })
      )
    );
    expect(html).toContain("line-clamp-3 sm:line-clamp-none");
    expect(html).toContain("Sitroner fra Amalfi.");
  });

  it("the toggle reads «Les mer» / «Vis mindre»", () => {
    expect(no.configurator.step2.showMore).toBe("Les mer");
    expect(no.configurator.step2.showLess).toBe("Vis mindre");
    expect(en.configurator.step2.showMore).toBe("Read more");
  });
});
