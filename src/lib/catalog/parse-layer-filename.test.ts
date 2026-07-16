import { describe, it, expect } from "vitest";
import { parseLayerFilename, matchPalette } from "./parse-layer-filename";

/**
 * F35 fixture (card §8.5) — the 43 real Photoshop export filenames from the
 * project-root `#Alici/` folder, as a STRING ARRAY (we test the names, not the
 * pixels; the PNGs are never committed — TL correction 1). Group `0000s` = 21
 * colours (complete); group `0001s` = 20 (missing `0019 #001c81`, the coverage
 * gap); + 2 bases without a hex.
 */
const ALICI_FILENAMES = [
  "Alici_0000_alici-orizz.png", // base, no hex → skip
  "Alici_0001_alici-circle.png", // base, no hex → skip
  // group 0000s — 21 colours, complete
  "Alici_0002s_0000s_0000_#a3759f.png", "Alici_0002s_0000s_0001_#ecae67.png",
  "Alici_0002s_0000s_0002_#5c3930.png", "Alici_0002s_0000s_0003_#3f6525.png",
  "Alici_0002s_0000s_0004_#3e8ea2.png", "Alici_0002s_0000s_0005_#b7c981.png",
  "Alici_0002s_0000s_0006_#93af74.png", "Alici_0002s_0000s_0007_#83c7bd.png",
  "Alici_0002s_0000s_0008_#059ea1.png", "Alici_0002s_0000s_0009_#eb686a.png",
  "Alici_0002s_0000s_0010_#cb595a.png", "Alici_0002s_0000s_0011_#e05f4c.png",
  "Alici_0002s_0000s_0012_#ff9048.png", "Alici_0002s_0000s_0013_#e59935.png",
  "Alici_0002s_0000s_0014_#f3e39a.png", "Alici_0002s_0000s_0015_#facf27.png",
  "Alici_0002s_0000s_0016_#78a3d4.png", "Alici_0002s_0000s_0017_#0160b2.png",
  "Alici_0002s_0000s_0018_#a6cee4.png", "Alici_0002s_0000s_0019_#001c81.png",
  "Alici_0002s_0000s_0020_#3877b9.png",
  // group 0001s — 20 colours, MISSING 0019 (#001c81) = the coverage gap
  "Alici_0002s_0001s_0000_#a3759f.png", "Alici_0002s_0001s_0001_#ecae67.png",
  "Alici_0002s_0001s_0002_#5c3930.png", "Alici_0002s_0001s_0003_#3f6525.png",
  "Alici_0002s_0001s_0004_#3e8ea2.png", "Alici_0002s_0001s_0005_#b7c981.png",
  "Alici_0002s_0001s_0006_#93af74.png", "Alici_0002s_0001s_0007_#83c7bd.png",
  "Alici_0002s_0001s_0008_#059ea1.png", "Alici_0002s_0001s_0009_#eb686a.png",
  "Alici_0002s_0001s_0010_#cb595a.png", "Alici_0002s_0001s_0011_#e05f4c.png",
  "Alici_0002s_0001s_0012_#ff9048.png", "Alici_0002s_0001s_0013_#e59935.png",
  "Alici_0002s_0001s_0014_#f3e39a.png", "Alici_0002s_0001s_0015_#facf27.png",
  "Alici_0002s_0001s_0016_#78a3d4.png", "Alici_0002s_0001s_0017_#0160b2.png",
  "Alici_0002s_0001s_0018_#a6cee4.png", "Alici_0002s_0001s_0020_#3877b9.png",
];

/** The 21 palette hexes (group 0000s), the canonical Alici glaze set. */
const ALICI_PALETTE_HEXES = [
  "#a3759f", "#ecae67", "#5c3930", "#3f6525", "#3e8ea2", "#b7c981", "#93af74",
  "#83c7bd", "#059ea1", "#eb686a", "#cb595a", "#e05f4c", "#ff9048", "#e59935",
  "#f3e39a", "#facf27", "#78a3d4", "#0160b2", "#a6cee4", "#001c81", "#3877b9",
];

describe("parseLayerFilename", () => {
  it("extracts a #hex anywhere in the name, lowercased", () => {
    expect(parseLayerFilename("Amalfi lemons_layer 1_#112233.png")).toEqual({ hex: "#112233" });
    expect(parseLayerFilename("x_#AABBCC_y.webp")).toEqual({ hex: "#aabbcc" });
  });

  it("falls back to a trailing 6-hex token without '#'", () => {
    expect(parseLayerFilename("foo_a3759f.png")).toEqual({ hex: "#a3759f" });
    expect(parseLayerFilename("foo_A3759F.jpg")).toEqual({ hex: "#a3759f" });
  });

  it("rejects names with no hex", () => {
    expect(parseLayerFilename("Alici_0000_alici-orizz.png")).toEqual({ error: "no-hex" });
    expect(parseLayerFilename("Alici_0001_alici-circle.png")).toEqual({ error: "no-hex" });
  });

  it("does not treat a 4-digit index as a hex", () => {
    expect(parseLayerFilename("Alici_0000_thing.png")).toEqual({ error: "no-hex" });
  });

  it("the real #Alici export: 41 parse to a hex, 2 skip", () => {
    const parsed = ALICI_FILENAMES.map(parseLayerFilename);
    expect(parsed.filter((r) => "hex" in r)).toHaveLength(41);
    expect(parsed.filter((r) => "error" in r)).toHaveLength(2);
  });
});

describe("matchPalette", () => {
  const palette = ALICI_PALETTE_HEXES.map((hex) => ({ hex }));

  it("group 0001s (20 files) vs the 21-colour palette → 20 matched, #001c81 uncovered", () => {
    const files = ALICI_FILENAMES.filter((n) => n.includes("_0001s_")).map((name) => ({ name }));
    const r = matchPalette(files, palette);
    expect(r.matched).toHaveLength(20);
    expect(r.unmatched).toHaveLength(0);
    expect(r.duplicates).toHaveLength(0);
    expect(r.uncoveredPaletteHexes).toEqual(["#001c81"]);
  });

  it("the whole export in one batch → 21 matched, 20 duplicates, 2 no-hex, 0 uncovered", () => {
    const r = matchPalette(ALICI_FILENAMES.map((name) => ({ name })), palette);
    expect(r.matched).toHaveLength(21);
    expect(r.duplicates).toHaveLength(20);
    expect(r.unmatched).toEqual([
      { name: "Alici_0000_alici-orizz.png", reason: "no-hex" },
      { name: "Alici_0001_alici-circle.png", reason: "no-hex" },
    ]);
    expect(r.uncoveredPaletteHexes).toHaveLength(0);
  });

  it("flags a hex that is not in the palette", () => {
    const r = matchPalette([{ name: "x_#000000.png" }], palette);
    expect(r.unmatched).toEqual([{ name: "x_#000000.png", reason: "not-in-palette" }]);
  });
});
