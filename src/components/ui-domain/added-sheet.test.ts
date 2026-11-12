/**
 * R5-FEEDBACK-UX AC3 — «Gå til handlekurven» next to «Fortsett å handle».
 *
 * `AddedSheet` cannot be string-rendered (Radix portal, no DOM here — see
 * sheet-offer-block.test.ts), so the row of buttons is its own component and
 * is what gets exercised: both labels from the real dictionaries, and the tap
 * reaching `onGoToCart`. What the caller does with it — close the panel, then
 * `openCart()` — is two lines in ceramics-step.tsx.
 */
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { AddedSheetActions } from "@/components/ui-domain/added-sheet";
import en from "@/i18n/messages/en.json";
import no from "@/i18n/messages/no.json";

// No DOM to click in: the stub keeps each button's own onClick by testid.
const clicks: Record<string, () => void> = {};
vi.mock("@/components/ui/button", () => ({
  Button: (p: { "data-testid": string; onClick: () => void; children: ReactNode }) => {
    clicks[p["data-testid"]] = p.onClick;
    return h("button", null, p.children);
  },
}));

const render = (locale: "no" | "en", handlers = { onContinue: () => {}, onGoToCart: () => {} }) =>
  renderToStaticMarkup(
    h(
      NextIntlClientProvider,
      { locale, messages: locale === "no" ? no : en },
      h(AddedSheetActions, handlers)
    )
  );

describe("AddedSheetActions", () => {
  it("shows both ways out, NO and EN", () => {
    const html = render("no");
    expect(html).toContain("Gå til handlekurven");
    expect(html).toContain("Fortsett å handle");
    expect(render("en")).toContain("Go to the basket");
  });

  it("«Gå til handlekurven» calls onGoToCart, «Fortsett å handle» onContinue", () => {
    const onGoToCart = vi.fn();
    const onContinue = vi.fn();
    render("no", { onContinue, onGoToCart });
    clicks["added-sheet-go-to-cart"]();
    expect(onGoToCart).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    clicks["added-sheet-continue"]();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
