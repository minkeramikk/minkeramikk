import { describe, expect, it } from "vitest";
import { kitWhitePiece } from "./kit-preview";

describe("kitWhitePiece (R5-FEEDBACK-UX AC1)", () => {
  it("a kit previews its white piece, never the painted thumb", () => {
    expect(kitWhitePiece({ kind: "kit", pieceImage: "products/plate.webp" })).toBe(
      "products/plate.webp"
    );
  });

  it("no piece photo: nothing to swap in, the thumb stays", () => {
    expect(kitWhitePiece({ kind: "kit", pieceImage: null })).toBeNull();
  });

  it("sets and designs keep their painted thumb", () => {
    for (const kind of ["set", "design"] as const) {
      expect(kitWhitePiece({ kind, pieceImage: "products/plate.webp" })).toBeNull();
    }
  });
});
