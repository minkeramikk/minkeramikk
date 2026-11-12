import { describe, expect, it } from "vitest";
import { kitWhitePiece } from "./kit-preview";

describe("kitWhitePiece (R5-FEEDBACK-UX AC1)", () => {
  it("a kit with the composed (painted) thumb previews its white piece", () => {
    expect(
      kitWhitePiece({ kind: "kit", customImage: false, pieceImage: "products/plate.webp" })
    ).toBe("products/plate.webp");
  });

  it("a custom upload stays: it is the shop's own picture", () => {
    expect(
      kitWhitePiece({ kind: "kit", customImage: true, pieceImage: "products/plate.webp" })
    ).toBeNull();
  });

  it("no piece photo: nothing to swap in", () => {
    expect(kitWhitePiece({ kind: "kit", customImage: false, pieceImage: null })).toBeNull();
  });

  it("sets and designs keep their painted thumb", () => {
    for (const kind of ["set", "design"] as const) {
      expect(
        kitWhitePiece({ kind, customImage: false, pieceImage: "products/plate.webp" })
      ).toBeNull();
    }
  });
});
