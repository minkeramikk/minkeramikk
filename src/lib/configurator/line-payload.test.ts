import { describe, it, expect } from "vitest";
import { buildConfigLinePayload, withCustomFields } from "./line-payload";
import { MAX_CUSTOM_TEXT } from "@/lib/orders/schema";
import type { DesignDetail } from "@/lib/catalog/design-options";

function design(acceptsCustomNotes: boolean, acceptsCustomText = false): DesignDetail {
  return {
    id: "d1",
    slug: "amalfi-dyr",
    code: "D",
    name: "Amalfi Dyr",
    nameNo: "Amalfi Dyr",
    nameEn: "Amalfi Animals",
    acceptsCustomNotes,
    acceptsCustomText,
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
