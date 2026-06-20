import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET,
  ConfigCodeError,
  decodeConfigCode,
  encodeConfigCode,
  normalizeConfigCode,
  toCodecDesign,
  type CodecCategory,
  type CodecDesign,
} from "./config-code";

// ── fixtures shaped like the real catalog ──────────────────────────────────

function makeCategory(slug: string, nOptions: number): CodecCategory {
  const optionCodeToId: Record<string, string> = {};
  for (let i = 0; i < nOptions; i++) {
    const code = CODE_ALPHABET[i]; // single safe char per option (catalog ≤31)
    optionCodeToId[code] = `${slug}-opt-${i}`;
  }
  return {
    slug,
    optionCodeToId,
    defaultOptionId: `${slug}-opt-0`,
  };
}

// mimic the 6 designs with varying category counts/sizes
const DESIGNS: CodecDesign[] = [
  { code: "A", slug: "blomster-1", categories: [makeCategory("details", 20), makeCategory("borders", 20)] },
  { code: "B", slug: "blomster-2", categories: [makeCategory("borders", 20), makeCategory("leaves", 20)] },
  {
    code: "C",
    slug: "amalfi-dyr",
    categories: [
      makeCategory("animal", 14),
      makeCategory("dots", 19),
      makeCategory("inner-circle", 20),
      makeCategory("main-color", 20),
      makeCategory("plants-color", 20),
    ],
  },
  { code: "D", slug: "krabbe", categories: [makeCategory("borders", 20), makeCategory("colors", 20), makeCategory("line", 1)] },
  { code: "E", slug: "striper", categories: [makeCategory("stripes", 20)] },
  { code: "F", slug: "juletre", categories: [makeCategory("borders", 21), makeCategory("decorations", 21), makeCategory("tree", 1)] },
];

const byCode = (code: string) =>
  DESIGNS.find((d) => d.code === code.toUpperCase()) ?? null;

// seeded PRNG for reproducible "property" runs
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFullSelection(
  design: CodecDesign,
  rnd: () => number
): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const cat of design.categories) {
    const ids = Object.values(cat.optionCodeToId);
    sel[cat.slug] = ids[Math.floor(rnd() * ids.length)];
  }
  return sel;
}

describe("config-code — alphabet & normalize", () => {
  it("alphabet excludes the ambiguous 0 O 1 I L", () => {
    expect(CODE_ALPHABET).not.toMatch(/[0O1IL]/);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length); // no dups
  });

  it("normalizes case, spaces and dirty separators", () => {
    expect(normalizeConfigCode("  mk -a__b ")).toBe("MK-AB"); // underscores dropped
    expect(normalizeConfigCode("mk—a—b")).toBe("MKAB"); // em-dash dropped (not '-')
    expect(normalizeConfigCode("MK-A--B")).toBe("MK-A-B"); // collapse repeats
  });
});

describe("config-code — encode", () => {
  it("orders segments by category slug, not by declaration order", () => {
    // blomster-2 declares [borders, leaves]; slug order is borders < leaves
    const d = byCode("B")!;
    const code = encodeConfigCode(d, {
      leaves: "leaves-opt-3",
      borders: "borders-opt-5",
    });
    // MK-B-<borders><leaves>
    expect(code).toBe(`MK-B-${CODE_ALPHABET[5]}-${CODE_ALPHABET[3]}`);
  });

  it("missing selection falls back to the category default", () => {
    const d = byCode("A")!;
    const code = encodeConfigCode(d, {}); // nothing chosen → all defaults (opt-0 = 'A')
    expect(code).toBe("MK-A-A-A");
  });
});

describe("config-code — round-trip (property-based, all designs)", () => {
  it("decode(encode(sel)) === sel for many random full selections", () => {
    const rnd = mulberry32(20260606);
    let runs = 0;
    for (let i = 0; i < 600; i++) {
      const design = DESIGNS[Math.floor(rnd() * DESIGNS.length)];
      const sel = randomFullSelection(design, rnd);
      const code = encodeConfigCode(design, sel);
      const decoded = decodeConfigCode(code, byCode);
      expect(decoded.designSlug).toBe(design.slug);
      expect(decoded.selections).toEqual(sel);
      runs++;
    }
    expect(runs).toBe(600);
  });

  it("round-trips through dirty/lowercase input", () => {
    const d = byCode("C")!;
    const sel = randomFullSelection(d, mulberry32(7));
    const code = encodeConfigCode(d, sel);
    const dirty = `  ${code.toLowerCase().replace(/-/g, " - ")} `;
    expect(decodeConfigCode(dirty, byCode).selections).toEqual(sel);
  });
});

describe("config-code — tolerant decode (degenerate cases, never crash)", () => {
  it("empty input throws a gentle ConfigCodeError", () => {
    expect(() => decodeConfigCode("", byCode)).toThrow(ConfigCodeError);
    expect(() => decodeConfigCode("   ", byCode)).toThrow(ConfigCodeError);
  });

  it("unknown design code throws ConfigCodeError", () => {
    expect(() => decodeConfigCode("MK-Z-A-A", byCode)).toThrow(ConfigCodeError);
  });

  it("missing segment → category default", () => {
    // design A categories sorted by slug = [borders, details]; give only the first
    const decoded = decodeConfigCode("MK-A-C", byCode);
    expect(decoded.selections["borders"]).toBe("borders-opt-2"); // 'C' = index 2
    expect(decoded.selections["details"]).toBe("details-opt-0"); // missing → default
  });

  it("extra segments are ignored", () => {
    const decoded = decodeConfigCode("MK-E-D-Z-Z-Z", byCode); // striper has 1 category
    expect(decoded.selections["stripes"]).toBe("stripes-opt-3"); // 'D' = index 3
    expect(Object.keys(decoded.selections)).toEqual(["stripes"]);
  });

  it("unknown option code in a segment → category default", () => {
    const decoded = decodeConfigCode("MK-A-9-9", byCode); // '9' beyond 20 options
    expect(decoded.selections["details"]).toBe("details-opt-0");
    expect(decoded.selections["borders"]).toBe("borders-opt-0");
  });

  it("works without the MK prefix", () => {
    const decoded = decodeConfigCode("A-A-A", byCode);
    expect(decoded.designSlug).toBe("blomster-1");
  });
});

describe("toCodecDesign defaultOptionId", () => {
  function detail(opts: { id: string; code: string; isDefault?: boolean }[]) {
    return {
      code: "D1",
      slug: "d1",
      categories: [{ slug: "color", options: opts }],
    };
  }

  it("prefers the option flagged is_default, even when not first", () => {
    const codec = toCodecDesign(
      detail([
        { id: "o1", code: "a" },
        { id: "o2", code: "b", isDefault: true },
        { id: "o3", code: "c" },
      ])
    );
    expect(codec?.categories[0]?.defaultOptionId).toBe("o2");
  });

  it("falls back to the first option when none is flagged (pre-R2-1 behaviour)", () => {
    const codec = toCodecDesign(
      detail([
        { id: "o1", code: "a" },
        { id: "o2", code: "b" },
      ])
    );
    expect(codec?.categories[0]?.defaultOptionId).toBe("o1");
  });

  it("keeps the full code→id map regardless of which option is default", () => {
    const codec = toCodecDesign(
      detail([
        { id: "o1", code: "a" },
        { id: "o2", code: "b", isDefault: true },
      ])
    );
    expect(codec?.categories[0]?.optionCodeToId).toEqual({ a: "o1", b: "o2" });
  });
});
