import { describe, it, expect } from "vitest";
import { stripFeaturedCode, stripFeaturedSet } from "./featured-strip";
import { decodeSetParam, encodeSetParam } from "@/lib/cart/set-code";
import { encodeConfigCode, type CodecDesign } from "@/lib/configurator/config-code";

// ── fixture catalog: two 1-category designs ────────────────────────────────
const DESIGN_A: CodecDesign = {
  code: "A",
  slug: "design-a",
  categories: [
    { slug: "colors", optionCodeToId: { B: "a-colors-b" }, defaultOptionId: "a-colors-b" },
  ],
};
const DESIGN_B: CodecDesign = {
  code: "B",
  slug: "design-b",
  categories: [
    { slug: "colors", optionCodeToId: { C: "b-colors-c" }, defaultOptionId: "b-colors-c" },
  ],
};
const findByCode = (code: string): CodecDesign | null =>
  [DESIGN_A, DESIGN_B].find((d) => d.code === code.toUpperCase()) ?? null;

const SEL_A = { colors: "a-colors-b" };
const SEL_B = { colors: "b-colors-c" };

describe("stripFeaturedCode", () => {
  it("strips a code carrying an inscription down to colours-only", () => {
    const colourOnly = encodeConfigCode(DESIGN_A, SEL_A);
    const withInscription = encodeConfigCode(DESIGN_A, SEL_A, {
      customText: "Til Anna",
    });
    expect(withInscription).not.toBe(colourOnly); // sanity: really carries more

    expect(stripFeaturedCode(withInscription, findByCode)).toBe(colourOnly);
  });

  it("strips a colour-wish-only code too (hash alone, no inscription)", () => {
    const colourOnly = encodeConfigCode(DESIGN_A, SEL_A);
    const withWish = encodeConfigCode(DESIGN_A, SEL_A, {
      customNote: "litt mer blått, takk",
    });
    expect(withWish).not.toBe(colourOnly);
    expect(stripFeaturedCode(withWish, findByCode)).toBe(colourOnly);
  });

  it("a code with nothing to strip round-trips unchanged", () => {
    const colourOnly = encodeConfigCode(DESIGN_A, SEL_A);
    expect(stripFeaturedCode(colourOnly, findByCode)).toBe(colourOnly);
  });

  it("an unresolvable design is left unchanged, never throws (this function only strips, never rejects)", () => {
    expect(stripFeaturedCode("MK-ZZZ-Q", findByCode)).toBe("MK-ZZZ-Q");
  });

  it("garbage input never throws", () => {
    expect(() => stripFeaturedCode("###", findByCode)).not.toThrow();
    expect(() => stripFeaturedCode("", findByCode)).not.toThrow();
  });
});

describe("stripFeaturedSet", () => {
  it("strips every row's inscription, keeping slugs/qty untouched", () => {
    const colourA = encodeConfigCode(DESIGN_A, SEL_A);
    const colourB = encodeConfigCode(DESIGN_B, SEL_B);
    const textA = encodeConfigCode(DESIGN_A, SEL_A, { customText: "Til Anna" });
    const textB = encodeConfigCode(DESIGN_B, SEL_B, { customText: "Til Kari" });

    const dirtyPayload = encodeSetParam([
      { configCode: textA, productSlug: "mug", quantity: 2 },
      { configCode: textB, productSlug: "bowl", quantity: 1 },
    ]);
    // sanity: the payload we're about to strip really carries the dedications
    expect(dirtyPayload).toContain(textA);
    expect(dirtyPayload).toContain(textB);

    const cleaned = stripFeaturedSet(dirtyPayload, findByCode);
    const { entries, dropped } = decodeSetParam(cleaned);
    expect(dropped).toBe(0);
    expect(entries).toEqual([
      { configCode: colourA, productSlug: "mug", qty: 2 },
      { configCode: colourB, productSlug: "bowl", qty: 1 },
    ]);
  });

  it("a set with nothing to strip round-trips to the same rows", () => {
    const colourA = encodeConfigCode(DESIGN_A, SEL_A);
    const payload = encodeSetParam([
      { configCode: colourA, productSlug: "mug", quantity: 1 },
    ]);
    expect(decodeSetParam(stripFeaturedSet(payload, findByCode)).entries).toEqual([
      { configCode: colourA, productSlug: "mug", qty: 1 },
    ]);
  });

  it("garbage payload never throws (degrades to an empty/dropped set)", () => {
    expect(() => stripFeaturedSet("not a set", findByCode)).not.toThrow();
  });
});
