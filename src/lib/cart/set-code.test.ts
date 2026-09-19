import { describe, it, expect } from "vitest";
import {
  clampQty,
  decodeSetParam,
  encodeSetParam,
  SET_FIELD_SEP,
  SET_MAX_LINES,
  SET_ROW_SEP,
} from "./set-code";
import {
  CODE_ALPHABET,
  encodeConfigCode,
  type CodecDesign,
} from "@/lib/configurator/config-code";

const line = (configCode: string, productSlug: string, quantity: number) => ({
  configCode,
  productSlug,
  qty: quantity,
});

// ── fixture design for the inscription-stripping tests (AC 3) ─────────────
const TEXT_DESIGN: CodecDesign = {
  code: "T",
  slug: "text-design",
  categories: [
    { slug: "colors", optionCodeToId: { B: "colors-opt-b" }, defaultOptionId: "colors-opt-b" },
  ],
};
const findTextDesign = (code: string): CodecDesign | null =>
  code.toUpperCase() === TEXT_DESIGN.code ? TEXT_DESIGN : null;
const SEL = { colors: "colors-opt-b" };

describe("separator guard (CA-3 decision 3)", () => {
  it("the F04 code alphabet never contains the set separators", () => {
    expect(CODE_ALPHABET).not.toContain(SET_FIELD_SEP);
    expect(CODE_ALPHABET).not.toContain(SET_ROW_SEP);
    // codes also carry `-` between segments — still no collision
    expect(SET_FIELD_SEP).not.toBe("-");
    expect(SET_ROW_SEP).not.toBe("-");
  });

  it("slugs (slugify charset a-z0-9-) never contain the separators", () => {
    expect(/^[a-z0-9-]+$/.test(SET_FIELD_SEP)).toBe(false);
    expect(/^[a-z0-9-]+$/.test(SET_ROW_SEP)).toBe(false);
  });

  it("separators survive encodeURIComponent unchanged (readable URLs)", () => {
    const raw = `MK-A-B${SET_FIELD_SEP}flat-plate${SET_FIELD_SEP}2${SET_ROW_SEP}MK-C${SET_FIELD_SEP}mug${SET_FIELD_SEP}1`;
    expect(encodeURIComponent(raw)).toBe(raw);
  });
});

describe("encodeSetParam", () => {
  it("encodes lines as code.slug.qty joined by ~", () => {
    const out = encodeSetParam([
      { configCode: "MK-A-K2-M1", productSlug: "flat-plate", quantity: 2 },
      { configCode: "MK-C-B1", productSlug: "mug", quantity: 1 },
    ]);
    expect(out).toBe("MK-A-K2-M1.flat-plate.2~MK-C-B1.mug.1");
  });

  it("skips legacy lines without productSlug (not-shareable, counted by the UI)", () => {
    const out = encodeSetParam([
      { configCode: "MK-A", productSlug: undefined, quantity: 1 },
      { configCode: "MK-C", productSlug: "mug", quantity: 1 },
    ]);
    expect(out).toBe("MK-C.mug.1");
  });

  it("skips lines with an empty or malformed configCode", () => {
    expect(
      encodeSetParam([
        { configCode: "", productSlug: "mug", quantity: 1 },
        { configCode: "mk a!", productSlug: "mug", quantity: 1 },
      ])
    ).toBe("");
  });

  it("clamps quantity into 1–99", () => {
    const out = encodeSetParam([
      { configCode: "MK-A", productSlug: "mug", quantity: 1500 },
      { configCode: "MK-C", productSlug: "mug", quantity: 0 },
    ]);
    expect(out).toBe("MK-A.mug.99~MK-C.mug.1");
  });

  it("empty cart → empty string", () => {
    expect(encodeSetParam([])).toBe("");
  });

  // R5-UNPAINTED: a null configCode is falsy, so the existing `.filter()`
  // already drops the row — this only pins the widened signature.
  it("leaves an unpainted line out of the link", () => {
    const encoded = encodeSetParam([
      { configCode: null, productSlug: "vietri-dinner", quantity: 2 },
      { configCode: "MK-ALICI-A1", productSlug: "vietri-side", quantity: 1 },
    ]);
    expect(encoded).toBe("MK-ALICI-A1.vietri-side.1");
  });
});

describe("encodeSetParam — strips the inscription segment (R5-TEXT-IDENTITY task 3, AC 3)", () => {
  const colourOnlyCode = encodeConfigCode(TEXT_DESIGN, SEL);
  const codeWithInscription = encodeConfigCode(TEXT_DESIGN, SEL, {
    customText: "Til Anna",
  });

  it("a line whose configCode carries an inscription encodes into set= without it", () => {
    // sanity: the fixture code really does carry more than just the colours
    expect(codeWithInscription).not.toBe(colourOnlyCode);

    const param = encodeSetParam(
      [{ configCode: codeWithInscription, productSlug: "mug", quantity: 1 }],
      findTextDesign
    );
    expect(param).toBe(`${colourOnlyCode}.mug.1`);

    const { entries, dropped } = decodeSetParam(param);
    expect(dropped).toBe(0);
    expect(entries[0].configCode).toBe(colourOnlyCode);
  });

  it("the stripped code still matches CODE_RE (share grammar: uppercase alnum + dashes)", () => {
    const param = encodeSetParam(
      [{ configCode: codeWithInscription, productSlug: "mug", quantity: 1 }],
      findTextDesign
    );
    const code = param.split(SET_FIELD_SEP)[0];
    expect(/^[A-Z0-9-]+$/.test(code)).toBe(true);
  });

  it("a code with no inscription is unaffected by stripping", () => {
    const param = encodeSetParam(
      [{ configCode: colourOnlyCode, productSlug: "mug", quantity: 1 }],
      findTextDesign
    );
    expect(param).toBe(`${colourOnlyCode}.mug.1`);
  });

  it("without a design resolver, today's callers see today's behaviour unchanged", () => {
    // no findDesignByCode passed — degrade to "leave the code as given",
    // exactly like every call site before this task.
    const param = encodeSetParam([
      { configCode: codeWithInscription, productSlug: "mug", quantity: 1 },
    ]);
    expect(param).toBe(`${codeWithInscription}.mug.1`);
  });

  it("an unresolvable design (unknown code) leaves the line's code unchanged, never throws", () => {
    const param = encodeSetParam(
      [{ configCode: "MK-ZZZ-Q", productSlug: "mug", quantity: 1 }],
      findTextDesign // only knows "T"
    );
    expect(param).toBe("MK-ZZZ-Q.mug.1");
  });
});

describe("decodeSetParam — round trip", () => {
  it("decodes what encode produced (realistic set)", () => {
    const lines = [
      { configCode: "MK-A-K2-M1-F3", productSlug: "flat-plate", quantity: 2 },
      { configCode: "MK-C-B1-R2", productSlug: "mug-large", quantity: 1 },
      { configCode: "MK-D", productSlug: "bowl", quantity: 99 },
    ];
    const { entries, dropped } = decodeSetParam(encodeSetParam(lines));
    expect(dropped).toBe(0);
    expect(entries).toEqual([
      line("MK-A-K2-M1-F3", "flat-plate", 2),
      line("MK-C-B1-R2", "mug-large", 1),
      line("MK-D", "bowl", 99),
    ]);
  });

  it("round-trips through a URLSearchParams cycle", () => {
    const param = encodeSetParam([
      { configCode: "MK-A-K2", productSlug: "flat-plate", quantity: 3 },
    ]);
    const url = new URLSearchParams({ set: param });
    const back = new URLSearchParams(url.toString()).get("set")!;
    expect(decodeSetParam(back).entries).toEqual([
      line("MK-A-K2", "flat-plate", 3),
    ]);
  });
});

describe("decodeSetParam — defensive parsing", () => {
  it("empty string → empty set, nothing dropped", () => {
    expect(decodeSetParam("")).toEqual({ entries: [], dropped: 0 });
  });

  it("pure garbage → everything dropped, never throws", () => {
    const { entries, dropped } = decodeSetParam("$$$~not a row~~..~японія");
    expect(entries).toEqual([]);
    expect(dropped).toBeGreaterThan(0);
  });

  it("a malformed row is dropped, valid neighbours survive", () => {
    const { entries, dropped } = decodeSetParam(
      "MK-A.mug.2~broken-row~MK-C.bowl.1"
    );
    expect(entries).toEqual([line("MK-A", "mug", 2), line("MK-C", "bowl", 1)]);
    expect(dropped).toBe(1);
  });

  it("wrong field count (separators in hostile places) → dropped", () => {
    for (const bad of [
      "MK-A.mug", // 2 fields
      "MK-A.mug.2.extra", // 4 fields
      ".mug.2", // empty code
      "MK-A..2", // empty slug
      "MK-A.mug.", // empty qty
    ]) {
      const { entries, dropped } = decodeSetParam(bad);
      expect(entries, bad).toEqual([]);
      expect(dropped, bad).toBe(1);
    }
  });

  it("non-numeric or oversized qty field → dropped", () => {
    for (const bad of ["MK-A.mug.x", "MK-A.mug.2x", "MK-A.mug.-1", "MK-A.mug.10000"]) {
      expect(decodeSetParam(bad).entries, bad).toEqual([]);
    }
  });

  it("out-of-range numeric qty → clamped, not dropped", () => {
    expect(decodeSetParam("MK-A.mug.0").entries).toEqual([line("MK-A", "mug", 1)]);
    expect(decodeSetParam("MK-A.mug.999").entries).toEqual([
      line("MK-A", "mug", 99),
    ]);
  });

  it("lowercase codes are normalized to uppercase", () => {
    expect(decodeSetParam("mk-a-k2.mug.1").entries).toEqual([
      line("MK-A-K2", "mug", 1),
    ]);
  });

  it("uppercase or hostile slugs are dropped (slug charset is strict)", () => {
    expect(decodeSetParam("MK-A.MUG.1").entries).toEqual([]);
    expect(decodeSetParam("MK-A.mug%20x.1").entries).toEqual([]);
  });

  it("trailing/duplicate row separators are tolerated", () => {
    const { entries, dropped } = decodeSetParam("~MK-A.mug.1~~");
    expect(entries).toEqual([line("MK-A", "mug", 1)]);
    expect(dropped).toBe(0);
  });

  it(`caps at ${SET_MAX_LINES} rows and counts the overflow`, () => {
    const raw = Array.from({ length: SET_MAX_LINES + 7 }, (_, i) =>
      ["MK-A", `mug-${i}`, "1"].join(".")
    ).join("~");
    const { entries, dropped } = decodeSetParam(raw);
    expect(entries).toHaveLength(SET_MAX_LINES);
    expect(dropped).toBe(7);
  });
});

describe("clampQty", () => {
  it("clamps and truncates", () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(2.9)).toBe(2);
    expect(clampQty(100)).toBe(99);
  });
});
