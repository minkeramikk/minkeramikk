import { describe, it, expect } from "vitest";
import { savePalette, renamePalette, touchPalette, paletteFor, MAX_PALETTES, type Palette } from "./palettes";

const make = (code: string, at = 0): Palette => ({
  code, name: `P-${code}`, designSlug: "alici",
  snapshot: { designSlug: "alici", designName: "Alici", selections: [] },
  layers: [], createdAt: at, usedAt: at,
});

describe("palette store", () => {
  it("saves a palette", () => {
    expect(savePalette([], make("A"))).toHaveLength(1);
  });

  it("the same colours twice are ONE palette, and the second save keeps the first name", () => {
    const first = savePalette([], { ...make("A"), name: "Bluebell" });
    const again = savePalette(first, { ...make("A", 50), name: "Bluebell" });
    expect(again).toHaveLength(1);
    expect(again[0].name).toBe("Bluebell");
    expect(again[0].usedAt).toBe(50);
  });

  it("evicts the LEAST RECENTLY USED when an eleventh arrives", () => {
    let list: Palette[] = [];
    for (let i = 0; i < MAX_PALETTES; i++) list = savePalette(list, make(`C${i}`, i));
    list = touchPalette(list, "C0", 999);          // C1 is now the oldest use
    list = savePalette(list, make("NEW", 1000));
    expect(list).toHaveLength(MAX_PALETTES);
    expect(paletteFor(list, "C1")).toBeNull();
    expect(paletteFor(list, "C0")).not.toBeNull();
    expect(paletteFor(list, "NEW")).not.toBeNull();
  });

  it("renames without touching anything else", () => {
    const list = renamePalette(savePalette([], make("A")), "A", "Coralline");
    expect(list[0].name).toBe("Coralline");
    expect(list[0].code).toBe("A");
  });

  it("trims a rename and ignores an empty one", () => {
    const list = savePalette([], { ...make("A"), name: "Bluebell" });
    expect(renamePalette(list, "A", "  Marine  ")[0].name).toBe("Marine");
    expect(renamePalette(list, "A", "   ")[0].name).toBe("Bluebell");
  });

  it("never mutates its input", () => {
    const list = savePalette([], make("A"));
    const copy = structuredClone(list);
    savePalette(list, make("B"));
    renamePalette(list, "A", "X");
    touchPalette(list, "A", 5);
    expect(list).toEqual(copy);
  });
});
