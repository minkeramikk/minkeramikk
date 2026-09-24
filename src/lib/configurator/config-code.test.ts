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

describe("config-code — text identity backward compatibility (R5-TEXT-IDENTITY task 2, AC 2)", () => {
  // Codes in TODAY's shape — the ones already sitting in a customer's
  // localStorage palette, an already-sent share link, or a cart row in an
  // open session — must decode EXACTLY as they did before this task, and
  // must never surface a customText. This has to hold before the encoder is
  // taught anything new, and keep holding after (re-run below the AC 1
  // tests confirms nothing regressed).

  it("every colour segment present (today's normal shape) → no customText", () => {
    const decoded = decodeConfigCode("MK-A-A-A", byCode); // design A: 2 categories, 2 segments, nothing more
    expect(decoded.selections).toEqual({
      borders: "borders-opt-0",
      details: "details-opt-0",
    });
    expect(decoded.customText).toBeUndefined();
  });

  it("one colour segment missing (an old short/truncated code) → defaults, no customText", () => {
    const decoded = decodeConfigCode("MK-A-C", byCode); // only 1 of design A's 2 segments given
    expect(decoded.selections["borders"]).toBe("borders-opt-2");
    expect(decoded.selections["details"]).toBe("details-opt-0"); // missing → default
    expect(decoded.customText).toBeUndefined();
  });

  it("one extra segment (old trailing noise past the last category) → ignored, no customText", () => {
    const decoded = decodeConfigCode("MK-E-D-Z-Z-Z", byCode); // striper has 1 category, 3 extra segments
    expect(decoded.selections).toEqual({ stripes: "stripes-opt-3" });
    expect(decoded.customText).toBeUndefined();
  });

  it("property check: every code from today's 2-arg encoder decodes with no customText", () => {
    const rnd = mulberry32(20260919);
    for (let i = 0; i < 200; i++) {
      const design = DESIGNS[Math.floor(rnd() * DESIGNS.length)];
      const sel = randomFullSelection(design, rnd);
      const code = encodeConfigCode(design, sel); // no extras — the only shape that existed before task 2
      expect(decodeConfigCode(code, byCode).customText).toBeUndefined();
    }
  });
});

describe("config-code — inscription identity (R5-TEXT-IDENTITY task 2, AC 1)", () => {
  const d = byCode("E")!; // striper: 1 category, keeps the fixture short
  const sel = { stripes: "stripes-opt-1" };

  it("two different inscriptions, same design/selections → two different codes", () => {
    const code1 = encodeConfigCode(d, sel, { customText: "Til Anna" });
    const code2 = encodeConfigCode(d, sel, { customText: "Til Kari" });
    expect(code1).not.toBe(code2);
  });

  it("the same inscription twice → the same code (determinism, keeps palette names stable)", () => {
    const code1 = encodeConfigCode(d, sel, { customText: "Gratulerer med dagen" });
    const code2 = encodeConfigCode(d, sel, { customText: "Gratulerer med dagen" });
    expect(code1).toBe(code2);
  });

  it("same colours AND same inscription, two different colour WISHES → two different codes", () => {
    // This is hashNote doing its job (R5-GARANZIA.md §5): two order lines
    // with identical colours/inscription but different private wishes must
    // not silently collapse into "the same configuration".
    const code1 = encodeConfigCode(d, sel, {
      customText: "Til Anna",
      customNote: "litt mer blått, takk",
    });
    const code2 = encodeConfigCode(d, sel, {
      customText: "Til Anna",
      customNote: "litt mer rosa, takk",
    });
    expect(code1).not.toBe(code2);
  });

  it("no inscription and no wish → byte-identical to the pre-task-2 (2-arg) call", () => {
    expect(encodeConfigCode(d, sel, {})).toBe(encodeConfigCode(d, sel));
    expect(encodeConfigCode(d, sel, { customText: "", customNote: "" })).toBe(
      encodeConfigCode(d, sel)
    );
  });

  it("decode recovers the inscription text but never the wish hash (identity only)", () => {
    const code = encodeConfigCode(d, sel, {
      customText: "Til Anna",
      customNote: "litt mer blått, takk",
    });
    const decoded = decodeConfigCode(code, byCode);
    expect(decoded.customText).toBe("Til Anna");
    expect(decoded).not.toHaveProperty("noteHash");
  });

  it("a colour wish alone (no inscription) still changes the code, but decodes with no customText", () => {
    const withWish = encodeConfigCode(d, sel, { customNote: "litt mer blått, takk" });
    const withoutWish = encodeConfigCode(d, sel);
    expect(withWish).not.toBe(withoutWish);
    expect(decodeConfigCode(withWish, byCode).customText).toBeUndefined();
  });
});

/**
 * ADR 0011 amendment (final-review round 2, finding 2 — BLOCKER). A design
 * that LOSES a category shifts an old code's real last colour segment into
 * the inscription slot (`parts[cats.length]`, now one shorter). Before the
 * checksum, an ordinary option code landed on "plausible content" there
 * roughly 1 time in 4 (measured: 232/961 two-character option codes, and
 * 7672/29791 three-character ones — reproduced here, not just quoted).
 * `decodeTextSegment`'s 2-char checksum (text-segment.ts) is what turns
 * "plausible" into "confirmed"; this suite re-proves the property AT THE
 * config-code.ts / decodeConfigCode level, which is what a customer's link
 * actually goes through.
 */
describe("config-code — ADR 0011 amendment: a lost category never fabricates an inscription", () => {
  // A single-category design so the "old" 2-segment code's SECOND segment
  // is unambiguously the one that would fall into the inscription slot
  // once the design shrinks to 1 category.
  const SHRUNK: CodecDesign = {
    code: "S",
    slug: "shrink-test",
    categories: [{ slug: "only", optionCodeToId: { A: "only-opt" }, defaultOptionId: "only-opt" }],
  };
  const findShrunk = (c: string) => (c.toUpperCase() === "S" ? SHRUNK : null);

  it("exhaustive: no 2-character option code decodes as a phantom inscription", () => {
    let phantom = 0;
    for (const a of CODE_ALPHABET) {
      for (const b of CODE_ALPHABET) {
        const decoded = decodeConfigCode(`MK-S-A-${a}${b}`, findShrunk);
        if (decoded.customText !== undefined) phantom++;
      }
    }
    // Measured before the checksum: 232/961. This is the number the
    // coordinator asked to see measured again, not argued.
    expect(phantom).toBe(0);
  });

  it("exhaustive: no 3-character option code decodes as a phantom inscription", () => {
    let phantom = 0;
    for (const a of CODE_ALPHABET) {
      for (const b of CODE_ALPHABET) {
        for (const c of CODE_ALPHABET) {
          const decoded = decodeConfigCode(`MK-S-A-${a}${b}${c}`, findShrunk);
          if (decoded.customText !== undefined) phantom++;
        }
      }
    }
    // Measured before the checksum: 7672/29791.
    expect(phantom).toBe(0);
  });

  it("a genuine inscription (with its real checksum) still decodes fine on the SAME design shape", () => {
    const sel = { only: "only-opt" };
    const code = encodeConfigCode(SHRUNK, sel, { customText: "Til Anna" });
    expect(decodeConfigCode(code, findShrunk).customText).toBe("Til Anna");
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

describe("config-code — text position (R5-TEXT-POSITION task 1, AC1)", () => {
  const d = byCode("E")!; // striper: 1 category, keeps the fixture short
  const sel = { stripes: "stripes-opt-1" };
  const withTopPositions: CodecDesign = { ...d, textPositions: ["top", "bottom"] };
  // Post-review revision: centre/back are opt-in too, no design offers
  // every position implicitly any more — a fixture with all four for the
  // round-trip/back/centre-default cases below.
  const allPositions: CodecDesign = { ...d, textPositions: ["top", "bottom", "centre", "back"] };

  it("round-trips text+top through the code", () => {
    const code = encodeConfigCode(withTopPositions, sel, {
      customText: "Til Anna",
      textPosition: "top",
    });
    const decoded = decodeConfigCode(code, () => withTopPositions);
    expect(decoded.textPosition).toBe("top");
    expect(decoded.customText).toBe("Til Anna");
  });

  it("no textPosition given, design offers centre → centre round-trips like any other position", () => {
    const code = encodeConfigCode(allPositions, sel, { customText: "Til Anna" });
    const decoded = decodeConfigCode(code, () => allPositions);
    expect(decoded.textPosition).toBe("centre");
  });

  it("no textPosition given, design does NOT offer centre → no textPosition at all", () => {
    const code = encodeConfigCode(withTopPositions, sel, { customText: "Til Anna" });
    const decoded = decodeConfigCode(code, () => withTopPositions);
    expect(decoded.textPosition).toBeUndefined();
  });

  it("a code from before this task (no position bits set, bit 0 only) decodes as centre only when the design offers it", () => {
    // Exactly what the OLD 2-arg / customText-only encoder already produced.
    const code = encodeConfigCode(d, sel, { customText: "Til Anna" });
    const decoded = decodeConfigCode(code, byCode);
    expect(decoded.textPosition).toBeUndefined(); // `byCode("E")` doesn't offer centre
  });

  it("top on a design that doesn't offer top → no textPosition on decode, not invented", () => {
    const noTop: CodecDesign = { ...d, textPositions: [] };
    // Encode carries whatever the caller asked for (encode doesn't gate);
    // decode is what enforces "this design doesn't offer it".
    const code = encodeConfigCode(withTopPositions, sel, {
      customText: "Til Anna",
      textPosition: "top",
    });
    const decoded = decodeConfigCode(code, () => noTop);
    expect(decoded.textPosition).toBeUndefined();
  });

  it("garbage inscription segment → no customText and no textPosition", () => {
    // Same shrunk-design trick as the ADR 0011 suite above: an ordinary
    // option code landing in the inscription slot must not fabricate either.
    const SHRUNK: CodecDesign = {
      code: "S",
      slug: "shrink-test",
      categories: [{ slug: "only", optionCodeToId: { A: "only-opt" }, defaultOptionId: "only-opt" }],
      textPositions: ["top", "bottom"],
    };
    const decoded = decodeConfigCode("MK-S-A-ZZ", (c) => (c.toUpperCase() === "S" ? SHRUNK : null));
    expect(decoded.customText).toBeUndefined();
    expect(decoded.textPosition).toBeUndefined();
  });

  it("back position round-trips too", () => {
    const code = encodeConfigCode(allPositions, sel, {
      customText: "Til Anna",
      textPosition: "back",
    });
    const decoded = decodeConfigCode(code, () => allPositions);
    expect(decoded.textPosition).toBe("back");
  });
});
