/**
 * R5-FEEDBACK-UX — what a kit shows as its preview (home card + welcome).
 *
 * A kit is unpainted by definition (ADR 0027), but its picture was a painted
 * design — the thumb composed from the kit's design, or a custom upload of
 * painted plates — so «Design selv» looked like a set already chosen
 * (Alessio 30/10). A kit previews the white photo of its first piece instead,
 * whatever its stored thumb is. Only a piece with no photo keeps the thumb.
 *
 * Pure (no DB) so it can be unit-tested: `featured.ts` is server-only.
 * Returns the storage path of the white piece, or null to keep the thumb.
 */
export function kitWhitePiece(f: {
  kind: "design" | "set" | "kit";
  pieceImage: string | null;
}): string | null {
  return f.kind === "kit" ? f.pieceImage : null;
}
