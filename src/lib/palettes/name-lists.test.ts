import { describe, it, expect, vi, afterEach } from "vitest";
import { DEFAULT_WORDS, paletteWords, type PaletteFamily } from "./name-lists";

const FAMILIES: PaletteFamily[] = ["blue", "green", "red", "yellow", "purple", "neutral"];

afterEach(() => { delete process.env.MK_PALETTE_WORDS; vi.restoreAllMocks(); });

describe("name lists", () => {
  it("has words for every family", () => {
    for (const f of FAMILIES) expect(DEFAULT_WORDS[f].length).toBeGreaterThan(0);
  });

  it("has no duplicate word, within a family or across families", () => {
    const all = FAMILIES.flatMap((f) => DEFAULT_WORDS[f]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("takes a valid MK_PALETTE_WORDS over the file", () => {
    process.env.MK_PALETTE_WORDS = JSON.stringify({ ...DEFAULT_WORDS, blue: ["Vietri", "Amalfi"] });
    expect(paletteWords().blue).toEqual(["Vietri", "Amalfi"]);
  });

  it("falls back to the file on broken JSON, with a warning and no throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MK_PALETTE_WORDS = "{not json";
    expect(paletteWords()).toEqual(DEFAULT_WORDS);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back on JSON of the wrong shape (missing family, empty list, not strings)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of [
      JSON.stringify({ blue: ["A"] }),                       // families missing
      JSON.stringify({ ...DEFAULT_WORDS, green: [] }),        // an empty family
      JSON.stringify({ ...DEFAULT_WORDS, red: [1, 2] }),      // not strings
      JSON.stringify(["Cobalto"]),                            // not an object
    ]) {
      process.env.MK_PALETTE_WORDS = bad;
      expect(paletteWords()).toEqual(DEFAULT_WORDS);
    }
    expect(warn).toHaveBeenCalled();
  });
});
