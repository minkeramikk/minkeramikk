import { describe, it, expect } from "vitest";
import { paletteMatchingCode, paletteMatchingColours } from "./save-gate";
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

/**
 * R5-TEXT-CARRY task 1 (AC1 + AC2) — the dedication IS the palette's
 * identity: only an EXACT code match (same design) counts as "already
 * saved". Two dedications on the same colours are two different palettes;
 * `canSaveDraft = !exactMatch` upstream offers Save for everything else.
 */
describe("paletteMatchingCode", () => {
  it("two DIFFERENT dedications on the same colours do NOT match (AC1)", () => {
    const savedTrude = encodeConfigCode(DESIGN, SEL, { customText: "Trude" });
    const draftMons = encodeConfigCode(DESIGN, SEL, { customText: "Mons" });
    // sanity: the fixture really is "same colours, different words"
    expect(savedTrude).not.toBe(draftMons);
    const palettes = [{ code: savedTrude, designSlug: DESIGN.slug }];
    expect(paletteMatchingCode(palettes, draftMons, DESIGN.slug)).toBeNull();
  });

  it("a dedication does NOT match the same colours saved WITHOUT one (AC1)", () => {
    const colourOnly = encodeConfigCode(DESIGN, SEL);
    const draftWithText = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const palettes = [{ code: colourOnly, designSlug: DESIGN.slug }];
    expect(paletteMatchingCode(palettes, draftWithText, DESIGN.slug)).toBeNull();
  });

  it("an EXACT match (same code, same design) resolves to the saved palette (AC2)", () => {
    const saved = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const entry = { code: saved, designSlug: DESIGN.slug };
    expect(paletteMatchingCode([entry], saved, DESIGN.slug)).toBe(entry);
  });

  it("null when the same code lives under a DIFFERENT design", () => {
    const code = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const palettes = [{ code, designSlug: OTHER_DESIGN.slug }];
    expect(paletteMatchingCode(palettes, code, DESIGN.slug)).toBeNull();
  });

  it("empty palette list → null", () => {
    const draft = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    expect(paletteMatchingCode([], draft, DESIGN.slug)).toBeNull();
  });
});

/**
 * Final-review round 2, finding 3 — "which palette is painting" (step 3's
 * `activePalette`) has to keep answering correctly once the on-screen code
 * carries an inscription the saved palette's own code doesn't.
 */
describe("paletteMatchingColours", () => {
  it("finds the saved palette by colours, ignoring the on-screen inscription", () => {
    const colourOnly = encodeConfigCode(DESIGN, SEL);
    const onScreen = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    const saved = { code: colourOnly, designSlug: DESIGN.slug, name: "Salvia" };
    expect(
      paletteMatchingColours([saved], onScreen, DESIGN.slug, SELECTION_COUNT)
    ).toBe(saved);
  });

  it("returns the SAME object reference (identity, for React === comparisons upstream)", () => {
    const saved = { code: encodeConfigCode(DESIGN, SEL), designSlug: DESIGN.slug };
    const onScreen = encodeConfigCode(DESIGN, SEL, { customNote: "litt mer blått" });
    const result = paletteMatchingColours([saved], onScreen, DESIGN.slug, SELECTION_COUNT);
    expect(result).toBe(saved);
  });

  it("null when no saved palette shares the colours", () => {
    const saved = { code: encodeConfigCode(DESIGN, { colors: "colors-opt-b" }), designSlug: DESIGN.slug };
    const differentDesign = encodeConfigCode(OTHER_DESIGN, SEL, { customText: "hi" });
    expect(
      paletteMatchingColours([saved], differentDesign, OTHER_DESIGN.slug, SELECTION_COUNT)
    ).toBeNull();
  });

  it("null across designs even when the stripped strings would coincide", () => {
    const savedOnOther = { code: encodeConfigCode(OTHER_DESIGN, SEL), designSlug: OTHER_DESIGN.slug };
    const onScreen = encodeConfigCode(DESIGN, SEL, { customText: "Til Anna" });
    expect(
      paletteMatchingColours([savedOnOther], onScreen, DESIGN.slug, SELECTION_COUNT)
    ).toBeNull();
  });

  it("an exact match (no inscription anywhere) still resolves", () => {
    const code = encodeConfigCode(DESIGN, SEL);
    const saved = { code, designSlug: DESIGN.slug };
    expect(paletteMatchingColours([saved], code, DESIGN.slug, SELECTION_COUNT)).toBe(saved);
  });
});
