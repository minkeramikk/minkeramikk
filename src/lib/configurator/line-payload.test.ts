import { describe, it, expect } from "vitest";
import { buildConfigLinePayload, withCustomFields } from "./line-payload";
import { decodeConfigCode, toCodecDesign } from "./config-code";
import { MAX_CUSTOM_TEXT } from "@/lib/orders/schema";
import type { DesignDetail } from "@/lib/catalog/design-options";

function design(
  acceptsCustomNotes: boolean,
  acceptsCustomText = false,
  textPositions: string[] = []
): DesignDetail {
  return {
    id: "d1",
    slug: "amalfi-dyr",
    code: "D",
    name: "Amalfi Dyr",
    nameNo: "Amalfi Dyr",
    nameEn: "Amalfi Animals",
    acceptsCustomNotes,
    acceptsCustomText,
    textPositions,
    descriptionStep2No: null,
    descriptionStep2En: null,
    images: [],
    categories: [
      {
        id: "c1",
        slug: "farge",
        labelNo: "Farge",
        labelEn: "Colour",
        kind: "color",
        layerSlot: "base",
        syncGroup: null,
        options: [
          { id: "o1", code: "A", name: "Blå", image: null, hex: "#123456", layerImage: null, isDefault: true },
        ],
      },
    ],
  };
}

describe("buildConfigLinePayload — customNote", () => {
  it("sets the trimmed note on a feature design", () => {
    const { snapshot } = buildConfigLinePayload(design(true), { farge: "o1" }, "  brown dog  ");
    expect(snapshot.customNote).toBe("brown dog");
    expect(snapshot.designNameNo).toBe("Amalfi Dyr");
    expect(snapshot.designNameEn).toBe("Amalfi Animals");
    expect(snapshot.designName).toBe("Amalfi Dyr");
  });

  it("sets an empty note (default mode) on a feature design", () => {
    const { snapshot } = buildConfigLinePayload(design(true), { farge: "o1" }, "");
    expect(snapshot.customNote).toBe("");
  });

  it("sets an empty note when no note arg is given on a feature design", () => {
    const { snapshot } = buildConfigLinePayload(design(true), { farge: "o1" });
    expect(snapshot.customNote).toBe("");
  });

  it("omits customNote entirely on a non-feature design even if a note is passed", () => {
    const { snapshot } = buildConfigLinePayload(design(false), { farge: "o1" }, "ignored");
    expect("customNote" in snapshot).toBe(false);
  });
});

describe("buildConfigLinePayload — customText (F38)", () => {
  it("sets the trimmed inscription on a text-enabled design", () => {
    const { snapshot } = buildConfigLinePayload(design(false, true), {}, "", "  Hei Åse  ");
    expect(snapshot.customText).toBe("Hei Åse");
  });
  it("omits customText when the value is whitespace-only (empty after trim)", () => {
    const { snapshot } = buildConfigLinePayload(design(false, true), {}, "", "   ");
    expect("customText" in snapshot).toBe(false);
  });
  it("omits customText entirely on a non-text design even if text is passed", () => {
    const { snapshot } = buildConfigLinePayload(design(false, false), {}, "", "Hei");
    expect("customText" in snapshot).toBe(false);
  });
  // TL mandate 1: forged URL (text=) is untrusted — the builder re-sanitises.
  it("sanitises + truncates a forged over-long / control-char value", () => {
    const forged = "\x00\x07" + "x".repeat(500);
    const { snapshot } = buildConfigLinePayload(design(false, true), {}, "", forged);
    expect(snapshot.customText).toBe("x".repeat(MAX_CUSTOM_TEXT));
    expect(snapshot.customText!.length).toBe(MAX_CUSTOM_TEXT);
  });
});

describe("buildConfigLinePayload — R5-TEXT-IDENTITY: the code carries the words", () => {
  it("two different inscriptions, same design/selections → two different codes", () => {
    const a = buildConfigLinePayload(design(false, true), { farge: "o1" }, "", "Til Anna");
    const b = buildConfigLinePayload(design(false, true), { farge: "o1" }, "", "Til Kari");
    expect(a.configCode).not.toBe(b.configCode);
  });

  it("the same inscription twice → the same code (determinism)", () => {
    const a = buildConfigLinePayload(design(false, true), { farge: "o1" }, "", "Til Anna");
    const b = buildConfigLinePayload(design(false, true), { farge: "o1" }, "", "Til Anna");
    expect(a.configCode).toBe(b.configCode);
  });

  it("same colours and same inscription, two different colour WISHES → two different codes", () => {
    // Closes R5-GARANZIA.md §5: the words never print on the piece, but the
    // wish is still identity — hashNote is what tells these two apart.
    const a = buildConfigLinePayload(
      design(true, true),
      { farge: "o1" },
      "litt mer blått, takk",
      "Til Anna"
    );
    const b = buildConfigLinePayload(
      design(true, true),
      { farge: "o1" },
      "litt mer rosa, takk",
      "Til Anna"
    );
    expect(a.configCode).not.toBe(b.configCode);
  });

  it("no inscription and no wish → the code is exactly what it was before this task", () => {
    const { configCode } = buildConfigLinePayload(design(false, false), { farge: "o1" });
    expect(configCode).toBe("MK-D-A");
  });

  it("a design that doesn't accept text never lets a passed customText into the code", () => {
    const withForgedText = buildConfigLinePayload(
      design(false, false),
      { farge: "o1" },
      "",
      "Hei"
    );
    const withNothing = buildConfigLinePayload(design(false, false), { farge: "o1" });
    expect(withForgedText.configCode).toBe(withNothing.configCode);
  });

  it("the code and the snapshot agree: decoding the code recovers the same inscription", () => {
    const detail = design(false, true);
    const { configCode, snapshot } = buildConfigLinePayload(
      detail,
      { farge: "o1" },
      "",
      "Til Anna"
    );
    const codec = toCodecDesign(detail)!;
    const decoded = decodeConfigCode(configCode, (c) =>
      c.toUpperCase() === codec.code ? codec : null
    );
    expect(decoded.customText).toBe(snapshot.customText);
  });
});

/**
 * R5-BASKET-HOST final review, finding 4b — the merge now has a SECOND caller:
 * step 2's `currentConfig` publisher, which lays the note/inscription onto a
 * snapshot the palette draft built without them. These cases are about that
 * caller; the `buildConfigLinePayload` blocks above cover the first one.
 */
describe("withCustomFields", () => {
  const base = buildConfigLinePayload(design(true, true), { farge: "o1" }).snapshot;

  it("lays the customer's own words onto a snapshot that had none", () => {
    // Exactly the step-2 case: the palette draft is note-free by design.
    const draft = buildConfigLinePayload(design(true, true), { farge: "o1" }).snapshot;
    const merged = withCustomFields(draft, design(true, true), "  brown dog  ", " Hei Åse ");
    expect(merged.customNote).toBe("brown dog");
    expect(merged.customText).toBe("Hei Åse");
    // …and changes nothing else, so the config code and the palette match
    // (which never see these fields) cannot move.
    expect(merged.designSlug).toBe(draft.designSlug);
    expect(merged.selections).toEqual(draft.selections);
  });

  it("clears a stale value when the design's gate is off", () => {
    const withWords = withCustomFields(base, design(true, true), "note", "Hei");
    const offDesign = withCustomFields(withWords, design(false, false), "note", "Hei");
    expect("customNote" in offDesign).toBe(false);
    expect("customText" in offDesign).toBe(false);
  });

  it("drops the inscription when it cleans to empty, keeps the empty note", () => {
    const merged = withCustomFields(base, design(true, true), "", "   ");
    expect(merged.customNote).toBe("");
    expect("customText" in merged).toBe(false);
  });

  it("re-sanitises the inscription, it does not merely trim it", () => {
    const merged = withCustomFields(base, design(true, true), "", "x".repeat(MAX_CUSTOM_TEXT + 20));
    expect(merged.customText).toHaveLength(MAX_CUSTOM_TEXT);
  });
});

describe("R5-TEXT-POSITION: textPosition rides the snapshot alongside customText", () => {
  it("buildConfigLinePayload writes textPosition, centre included, when there is text", () => {
    const { snapshot } = buildConfigLinePayload(
      design(false, true, ["top", "bottom"]),
      { farge: "o1" },
      "",
      "Hei",
      "top"
    );
    expect(snapshot.textPosition).toBe("top");
  });

  it("no textPosition arg given, but there IS text → centre, not absent", () => {
    const { snapshot } = buildConfigLinePayload(design(false, true), { farge: "o1" }, "", "Hei");
    expect(snapshot.textPosition).toBe("centre");
  });

  it("no text at all → no textPosition (nothing to attach it to)", () => {
    const { snapshot } = buildConfigLinePayload(design(false, true), { farge: "o1" }, "", "");
    expect("textPosition" in snapshot).toBe(false);
  });

  it("a position the design doesn't offer is clamped to centre", () => {
    const { snapshot } = buildConfigLinePayload(
      design(false, true, []), // no top/bottom offered
      { farge: "o1" },
      "",
      "Hei",
      "top"
    );
    expect(snapshot.textPosition).toBe("centre");
  });

  it("withCustomFields clears a stale textPosition when the design's text gate is off", () => {
    const draft = buildConfigLinePayload(design(true, true, ["top"]), { farge: "o1" }).snapshot;
    const withPos = withCustomFields(draft, design(true, true, ["top"]), "note", "Hei", "top");
    expect(withPos.textPosition).toBe("top");
    const offDesign = withCustomFields(withPos, design(false, false), "note", "Hei", "top");
    expect("textPosition" in offDesign).toBe(false);
  });

  it("the code and the snapshot agree on position too", () => {
    const detail = design(false, true, ["top", "bottom"]);
    const { configCode, snapshot } = buildConfigLinePayload(
      detail,
      { farge: "o1" },
      "",
      "Til Anna",
      "bottom"
    );
    const codec = toCodecDesign(detail)!;
    const decoded = decodeConfigCode(configCode, (c) =>
      c.toUpperCase() === codec.code ? codec : null
    );
    expect(decoded.textPosition).toBe(snapshot.textPosition);
  });
});
