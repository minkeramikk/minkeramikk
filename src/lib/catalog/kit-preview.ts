/**
 * R5-FEEDBACK-UX — what a kit shows as its preview (home card + welcome).
 *
 * A kit is unpainted by definition (ADR 0027), but its default thumb is
 * composed from the kit's design, so «Design selv» looked like a set already
 * chosen (Alessio 30/10). A kit with the composed thumb shows the white photo
 * of its first piece instead. A custom upload is the shop's own picture and
 * stays; so does the composed thumb when the piece has no photo.
 *
 * Pure (no DB) so it can be unit-tested: `featured.ts` is server-only.
 * Returns the storage path of the white piece, or null to keep the thumb.
 */
export function kitWhitePiece(f: {
  kind: "design" | "set" | "kit";
  customImage: boolean;
  pieceImage: string | null;
}): string | null {
  return f.kind === "kit" && !f.customImage ? f.pieceImage : null;
}
