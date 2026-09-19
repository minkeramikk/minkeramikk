import { describe, it, expect } from "vitest";
import {
  savePalette,
  renamePalette,
  touchPalette,
  deletePalette,
  paletteFor,
  paletteFamily,
  nameFor,
  sortCurrentDesignFirst,
  MAX_PALETTES,
  type Palette,
} from "./palettes";
import { DEFAULT_WORDS } from "./name-lists";

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

describe("deletePalette", () => {
  it("removes by code", () => {
    const list = savePalette([], make("A"));
    expect(deletePalette(list, "A")).toEqual([]);
  });

  it("leaves the rest in order", () => {
    const list = [make("A"), make("B"), make("C")];
    expect(deletePalette(list, "B").map((p) => p.code)).toEqual(["A", "C"]);
  });

  it("is a no-op for a code that is not there", () => {
    const list = [make("A")];
    expect(deletePalette(list, "NOPE")).toEqual(list);
  });

  it("never mutates its input", () => {
    const list = [make("A"), make("B")];
    const copy = structuredClone(list);
    deletePalette(list, "A");
    expect(list).toEqual(copy);
  });
});

describe("sortCurrentDesignFirst (card §4-bis, added mid-PR)", () => {
  const of = (code: string, designSlug: string) => ({ ...make(code), designSlug });

  it("puts every current-design palette before every other design's", () => {
    const list = [of("A", "limoni"), of("B", "alici"), of("C", "limoni"), of("D", "alici")];
    expect(sortCurrentDesignFirst(list, "alici").map((p) => p.code)).toEqual([
      "B",
      "D",
      "A",
      "C",
    ]);
  });

  it("preserves relative order within each group — a stable sort, not a filter", () => {
    const list = [of("A", "limoni"), of("B", "limoni"), of("C", "alici"), of("D", "alici")];
    const sorted = sortCurrentDesignFirst(list, "alici");
    // current design ("alici") first, in the order it already had
    expect(sorted.slice(0, 2).map((p) => p.code)).toEqual(["C", "D"]);
    // then the rest, ALSO in the order it already had — nothing dropped
    expect(sorted.slice(2).map((p) => p.code)).toEqual(["A", "B"]);
  });

  it("leaves a list with none of the current design unchanged", () => {
    const list = [of("A", "limoni"), of("B", "limoni")];
    expect(sortCurrentDesignFirst(list, "alici").map((p) => p.code)).toEqual(["A", "B"]);
  });

  it("does not mutate its input", () => {
    const list = [of("A", "limoni"), of("B", "alici")];
    const copy = structuredClone(list);
    sortCurrentDesignFirst(list, "alici");
    expect(list).toEqual(copy);
  });
});

const snap = (...sel: { label: string; option: string; hex: string | null }[]) => ({
  designSlug: "alici", designName: "Alici", selections: sel,
});

describe("naming", () => {
  it("puts the hue in the right family", () => {
    expect(paletteFamily("#3877b9")).toBe("blue");
    expect(paletteFamily("#3f6525")).toBe("green");
    expect(paletteFamily("#e05f4c")).toBe("red");
    expect(paletteFamily("#ecae67")).toBe("yellow");
    expect(paletteFamily("#a3759f")).toBe("purple");
    expect(paletteFamily("#9b9b9b")).toBe("neutral");   // no saturation ⇒ no hue
  });

  it("is deterministic and always a word from the family's list", () => {
    const s = snap({ label: "Hovedfarge", option: "Blu", hex: "#3877b9" });
    const a = nameFor("MK-ALICI-A1", s);
    expect(nameFor("MK-ALICI-A1", s)).toBe(a);
    expect(DEFAULT_WORDS.blue).toContain(a);
    expect(a).not.toMatch(/\d/);
  });

  it("prefers the design's MAIN COLOUR category over the first hexed selection", () => {
    const s = snap(
      { label: "Kant", option: "Verde", hex: "#3f6525" },
      { label: "Hovedfarge", option: "Blu", hex: "#3877b9" },
    );
    expect(DEFAULT_WORDS.blue).toContain(nameFor("MK-A-1", s));
  });

  it("falls back to the first hexed selection when no main-colour category exists", () => {
    const s = snap({ label: "Dyr", option: "Gris", hex: null }, { label: "Kant", option: "Verde", hex: "#3f6525" });
    expect(DEFAULT_WORDS.green).toContain(nameFor("MK-A-1", s));
  });

  it("never returns an empty name, even with no colours at all", () => {
    expect(nameFor("MK-A-1", snap()).length).toBeGreaterThan(0);
  });

  it("does not let an unrelated '...colour' category (e.g. 'Edge colour') outrank the real Hovedfarge one", () => {
    const s = snap(
      { label: "Edge colour", option: "Verde", hex: "#3f6525" },  // green, comes first
      { label: "Hovedfarge", option: "Blu", hex: "#3877b9" },      // blue, the real main colour
    );
    expect(DEFAULT_WORDS.blue).toContain(nameFor("MK-A-1", s));
    expect(DEFAULT_WORDS.green).not.toContain(nameFor("MK-A-1", s));
  });
});

// Round 4 (TL-reported duplicate «Zaffera»): the optional 4th `taken`
// argument, so two different codes in the same family can't be saved under
// the same word.
describe("naming — no duplicates (round 4)", () => {
  const blue = () => snap({ label: "Hovedfarge", option: "Blu", hex: "#3877b9" });

  it("with an empty taken-list, every existing name stays EXACTLY what it is today", () => {
    // Pins the no-collision path: passing `[]` explicitly (or omitting the
    // argument, its default) must produce the identical word — the new
    // parameter must never shift an uncontested palette's name.
    const s = blue();
    expect(nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, [])).toBe(nameFor("MK-ALICI-A1", s));
    expect(nameFor("MK-A-1", s, DEFAULT_WORDS, [])).toBe(nameFor("MK-A-1", s));
  });

  it("is deterministic for a given taken-list: same colours, same taken-list, same name, always", () => {
    const s = blue();
    const taken = ["Cobalto"];
    expect(nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, taken)).toBe(
      nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, taken)
    );
  });

  it("walks forward to the first FREE word, wrapping around the family's list", () => {
    const s = blue();
    const free = DEFAULT_WORDS.blue[2];
    const taken = DEFAULT_WORDS.blue.filter((w) => w !== free);
    expect(nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, taken)).toBe(free);
  });

  it("compares taken names trimmed and case-insensitively — a customer's own rename still blocks", () => {
    const s = blue();
    const base = nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, []);
    const renamedByCustomer = ` ${base.toLowerCase()} `;
    expect(nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, [renamedByCustomer])).not.toBe(base);
  });

  it("falls back to the word plus the main colour's own name once the whole family is taken", () => {
    const s = blue();
    const name = nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, DEFAULT_WORDS.blue);
    expect(name).toMatch(/ Blu$/); // "<word> Blu", e.g. "Zaffera Blu" — never a number
    expect(name).not.toMatch(/\d/);
  });

  it("keeps qualifying with the next coloured selection when the main-colour qualified name is ALSO taken", () => {
    const s = snap(
      { label: "Hovedfarge", option: "Blu", hex: "#3877b9" },
      { label: "Kant", option: "Verde", hex: "#3f6525" },
    );
    const base = nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, []);
    const taken = [...DEFAULT_WORDS.blue, `${base} Blu`];
    expect(nameFor("MK-ALICI-A1", s, DEFAULT_WORDS, taken)).toBe(`${base} Verde`);
  });
});

describe("paletteFamily on malformed hex (defensive: never throw, fall back to neutral)", () => {
  it.each(["nope", "", "#abc", "#12345", "#gggggg"])("treats %j as neutral, not NaN-driven", (bad) => {
    expect(paletteFamily(bad)).toBe("neutral");
  });
});
