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

describe("isCustomTextOffered", () => {
  const textGroup = group();

  it("hides the field while the first option (= no text) is selected", () => {
    expect(
      isCustomTextOffered({
        acceptsCustomText: true,
        textGroup,
        selectedOptionId: "none",
      })
    ).toBe(false);
  });

  it("shows the field on any other option", () => {
    expect(
      isCustomTextOffered({
        acceptsCustomText: true,
        textGroup,
        selectedOptionId: "navn",
      })
    ).toBe(true);
  });

  it("hides the field when nothing is selected yet", () => {
    expect(
      isCustomTextOffered({
        acceptsCustomText: true,
        textGroup,
        selectedOptionId: undefined,
      })
    ).toBe(false);
  });

  it("falls back to the historic behaviour without a text group", () => {
    expect(
      isCustomTextOffered({
        acceptsCustomText: true,
        textGroup: null,
        selectedOptionId: undefined,
      })
    ).toBe(true);
  });

  it("stays off when the design does not accept an inscription at all", () => {
    expect(
      isCustomTextOffered({
        acceptsCustomText: false,
        textGroup,
        selectedOptionId: "navn",
      })
    ).toBe(false);
  });
});

describe("normalizeGroupName", () => {
  it("survives null and undefined", () => {
    expect(normalizeGroupName(null)).toBe("");
    expect(normalizeGroupName(undefined)).toBe("");
  });
});
