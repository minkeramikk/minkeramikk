/**
 * R5-KIT-WELCOME-COPY — the welcome dialog says what is true since
 * R5-KIT-CONFIRM: nothing is in the basket until the CTA. The dialog lives in
 * a portal (no static markup), so the test resolves the keys each variant
 * reads against the real dictionaries.
 */
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { KIT_WELCOME_KEYS } from "@/components/ui-domain/kit-welcome";
import en from "@/i18n/messages/en.json";
import no from "@/i18n/messages/no.json";

const copy = (locale: "no" | "en", variant: keyof typeof KIT_WELCOME_KEYS, count: number) => {
  const t = createTranslator({
    locale,
    messages: locale === "no" ? no : en,
    namespace: "kit.welcome",
  });
  const k = KIT_WELCOME_KEYS[variant];
  return { title: t(k.title, { count }), body: t(k.body), cta: t(k.cta) };
};

describe("KitWelcome copy", () => {
  it("AC1 — kit, NO", () => {
    expect(copy("no", "kit", 3)).toEqual({
      title: "3 deler venter på dine farger",
      body: "Trykk på «Tilpass settet» for å legge keramikkdelene i handlekurven. Deretter velger du om alle skal ha samme design og farger, eller tilpasser hver del for seg.",
      cta: "Tilpass settet",
    });
  });

  it("AC1 — kit, EN", () => {
    expect(copy("en", "kit", 3)).toEqual({
      title: "3 pieces, waiting for your colours",
      body: "Press «Customise the set» to add the pieces to your basket. Then choose whether all of them get the same design and colours, or customise each piece on its own.",
      cta: "Customise the set",
    });
  });

  it("AC2 — set, NO (singular too)", () => {
    expect(copy("no", "set", 2)).toEqual({
      title: "Et ferdig sett med 2 deler",
      body: "Delene er ferdig designet. Legg dem i handlekurven for å bestille settet.",
      cta: "Legg i handlekurven",
    });
    expect(copy("no", "set", 1).title).toBe("Et ferdig sett med 1 del");
  });

  it("AC2 — set, EN", () => {
    expect(copy("en", "set", 2)).toEqual({
      title: "A finished set of 2 pieces",
      body: "The pieces are already designed. Add them to your basket to order the set.",
      cta: "Add to basket",
    });
  });

  it("AC2 — the set never speaks of colours to choose or of pieces already in the basket", () => {
    for (const locale of ["no", "en"] as const) {
      const text = Object.values(copy(locale, "set", 2)).join(" ");
      expect(text).not.toMatch(/farger|colours|allerede|already in/i);
    }
  });
});
