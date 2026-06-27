import { describe, it, expect } from "vitest";
import { buildConfigLinePayload } from "./line-payload";
import type { DesignDetail } from "@/lib/catalog/design-options";

function design(acceptsCustomNotes: boolean): DesignDetail {
  return {
    id: "d1",
    slug: "amalfi-dyr",
    code: "D",
    name: "Amalfi Dyr",
    nameNo: "Amalfi Dyr",
    nameEn: "Amalfi Animals",
    acceptsCustomNotes,
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
