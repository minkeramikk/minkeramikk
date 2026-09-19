import { describe, it, expect } from "vitest";
import { draftMatchesSavedColours } from "./save-gate";
import { encodeConfigCode, type CodecDesign } from "./config-code";

const DESIGN: CodecDesign = {
  code: "T",
  slug: "text-design",
  categories: [
    { slug: "colors", optionCodeToId: { B: "colors-opt-b" }, defaultOptionId: "colors-opt-b" },
  ],
};
const OTHER_DESIGN: CodecDesign = {
  code: "O",
  slug: "other-design",
  categories: [
    { slug: "colors", optionCodeToId: { B: "colors-opt-b" }, defaultOptionId: "colors-opt-b" },
  ],
};
const SEL = { colors: "colors-opt-b" };
const SELECTION_COUNT = 1; // DESIGN/OTHER_DESIGN both have 1 category

describe("draftMatchesSavedColours", () => {
  it("true when a saved palette has the SAME colours but no inscription", () => {
    const colourOnly = encodeConfigCode(DESIGN, SEL);
    const draftWithText = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const palettes = [{ code: colourOnly, designSlug: DESIGN.slug }];
    expect(
      draftMatchesSavedColours(palettes, draftWithText, DESIGN.slug, SELECTION_COUNT)
    ).toBe(true);
  });

  it("true across two DIFFERENT dedications on the same saved colours (the gift-set case)", () => {
    const saved = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const draftForKari = encodeConfigCode(DESIGN, SEL, { customText: "Til Kari" });
    const palettes = [{ code: saved, designSlug: DESIGN.slug }];
    expect(
      draftMatchesSavedColours(palettes, draftForKari, DESIGN.slug, SELECTION_COUNT)
    ).toBe(true);
  });

  it("true when only the colour WISH differs (hash-only segment)", () => {
    const saved = encodeConfigCode(DESIGN, SEL);
    const draftWithWish = encodeConfigCode(DESIGN, SEL, {
      customNote: "litt mer blått, takk",
    });
    const palettes = [{ code: saved, designSlug: DESIGN.slug }];
    expect(
      draftMatchesSavedColours(palettes, draftWithWish, DESIGN.slug, SELECTION_COUNT)
    ).toBe(true);
  });

  it("false when no saved palette shares the draft's colours", () => {
    const palettes = [
      { code: encodeConfigCode(DESIGN, { colors: "colors-opt-b" }), designSlug: DESIGN.slug },
    ];
    // A genuinely different colours-only code (different design entirely).
    const draft = encodeConfigCode(OTHER_DESIGN, SEL, { customText: "Til Anna" });
    expect(
      draftMatchesSavedColours(palettes, draft, OTHER_DESIGN.slug, SELECTION_COUNT)
    ).toBe(false);
  });

  it("false when the matching colours belong to a DIFFERENT design", () => {
    // Same option code, but this function must not cross designs even if a
    // (contrived) colours-only string happened to coincide.
    const savedOnOther = encodeConfigCode(OTHER_DESIGN, SEL);
    const draft = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const palettes = [{ code: savedOnOther, designSlug: OTHER_DESIGN.slug }];
    expect(
      draftMatchesSavedColours(palettes, draft, DESIGN.slug, SELECTION_COUNT)
    ).toBe(false);
  });

  it("true for an EXACT match too (a saved palette equals the draft outright)", () => {
    const saved = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const palettes = [{ code: saved, designSlug: DESIGN.slug }];
    expect(draftMatchesSavedColours(palettes, saved, DESIGN.slug, SELECTION_COUNT)).toBe(
      true
    );
  });

  it("empty palette list → false", () => {
    const draft = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    expect(draftMatchesSavedColours([], draft, DESIGN.slug, SELECTION_COUNT)).toBe(false);
  });
});
