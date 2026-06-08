import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases, folds Norwegian letters, hyphenates", () => {
    expect(slugify("Vietri Flat")).toBe("vietri-flat");
    expect(slugify("Båt Serveringsfat")).toBe("bat-serveringsfat");
    expect(slugify("Smørbrød & Øl")).toBe("smorbrod-ol");
    expect(slugify("  Trailing -- dashes  ")).toBe("trailing-dashes");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", () => {
    expect(uniqueSlug("Vietri Flat", [])).toBe("vietri-flat");
    expect(uniqueSlug("Vietri Flat", ["other"])).toBe("vietri-flat");
  });

  it("appends -2, -3 … on collision", () => {
    expect(uniqueSlug("Vietri Flat", ["vietri-flat"])).toBe("vietri-flat-2");
    expect(uniqueSlug("Vietri Flat", ["vietri-flat", "vietri-flat-2"])).toBe(
      "vietri-flat-3"
    );
  });

  it("falls back to 'item' for empty/symbolic names", () => {
    expect(uniqueSlug("!!!", [])).toBe("item");
    expect(uniqueSlug("!!!", ["item"])).toBe("item-2");
  });
});
