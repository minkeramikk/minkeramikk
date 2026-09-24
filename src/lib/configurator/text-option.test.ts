import { describe, expect, it } from "vitest";
import {
  findTextGroup,
  isCustomTextOffered,
  normalizeGroupName,
} from "./text-option";

const group = (over: Partial<Parameters<typeof findTextGroup>[0][number]> = {}) => ({
  slug: "tekst",
  labelNo: "Tekst",
  labelEn: "Text",
  options: [{ id: "none" }, { id: "navn" }, { id: "dato" }],
  ...over,
});

describe("findTextGroup", () => {
  it("finds the group by slug", () => {
    const cats = [group({ labelNo: null, labelEn: null })];
    expect(findTextGroup(cats)?.slug).toBe("tekst");
  });

  it("finds it by the English label when the slug is something else", () => {
    const cats = [group({ slug: "inscription", labelNo: null, labelEn: "Text" })];
    expect(findTextGroup(cats)?.slug).toBe("inscription");
  });

  it("ignores case, padding and diacritics", () => {
    const cats = [group({ slug: "x", labelNo: "  TÉKST ", labelEn: null })];
    expect(findTextGroup(cats)?.slug).toBe("x");
  });

  it("returns null when no group is about text", () => {
    const cats = [group({ slug: "kant", labelNo: "Kant", labelEn: "Border" })];
    expect(findTextGroup(cats)).toBeNull();
  });

  it("never matches a name that merely contains 'text'", () => {
    const cats = [group({ slug: "texture", labelNo: "Textur", labelEn: "Texture" })];
    expect(findTextGroup(cats)).toBeNull();
  });
});

describe("normalizeGroupName", () => {
  it("survives null and undefined", () => {
    expect(normalizeGroupName(null)).toBe("");
    expect(normalizeGroupName(undefined)).toBe("");
  });
});

// R5-TEXT-POSITION (0.1-1): the «Tekst» group governs NOTHING anymore — the
// gate is `acceptsCustomText` alone, whether the group is absent, empty, or
// still has options in prod pending cleanup (GARANZIA §7, outside this card).
describe("isCustomTextOffered", () => {
  it("shows the field whenever the design accepts an inscription", () => {
    expect(isCustomTextOffered({ acceptsCustomText: true })).toBe(true);
  });

  it("stays off when the design does not accept an inscription at all", () => {
    expect(isCustomTextOffered({ acceptsCustomText: false })).toBe(false);
  });
});
