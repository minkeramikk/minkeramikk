/**
 * Text position domain (R5-TEXT-POSITION). Pure, no DB, no React — where the
 * customer's inscription sits on the plate: the CENTRE (today's only spot),
 * an arc along the TOP or BOTTOM inner ring, or on the BACK (no preview).
 *
 * Rides text-segment.ts's bits 2-3 (`RESERVED_MASK 0b1100`), reserved for
 * exactly this since R5-TEXT-IDENTITY (task 1) — see that file's doc
 * comment for the format's hard ceiling. A position only ever travels
 * alongside an inscription: text-segment.ts already drops the segment
 * entirely when there's no text, so a position with nothing to say has
 * nowhere to live either (0.1-3).
 */

export type TextPosition = "centre" | "top" | "bottom" | "back";

/** Chip order (DS §3.33): the order they're offered in, always. */
export const TEXT_POSITIONS: readonly TextPosition[] = ["centre", "top", "bottom", "back"];

/** The 2 reserved bits (bits 2-3 of `flags`, mask 0b1100): 4 values, 4 positions. */
export const POSITION_BITS: Record<TextPosition, number> = {
  centre: 0,
  top: 4,
  bottom: 8,
  back: 12,
};

const BITS_TO_POSITION: Record<number, TextPosition> = {
  0: "centre",
  4: "top",
  8: "bottom",
  12: "back",
};

/** `flags` → the position it encodes. Masks to bits 2-3 first, so bits 0-1
 *  (FLAG_TEXT/FLAG_NOTE_HASH) never leak in; any masked value this map
 *  doesn't recognise (there isn't one today, mask covers exactly 0/4/8/12)
 *  degrades to `centre` rather than throwing — same tolerance as the rest
 *  of the codec (ADR 0011). */
export function positionFromFlags(flags: number): TextPosition {
  return BITS_TO_POSITION[flags & 0b1100] ?? "centre";
}

/** The position's own reserved bits, ready to OR into `encodeTextSegment`'s
 *  `flags` input alongside FLAG_TEXT/FLAG_NOTE_HASH. */
export function flagsForPosition(pos: TextPosition): number {
  return POSITION_BITS[pos];
}

/** `centre` and `back` are always offered; `top`/`bottom` only when the
 *  design's own `text_positions` column says so (0.1-5) — in a fixed
 *  top-then-bottom order regardless of how `extra` lists them. Unknown
 *  values in `extra` (a stray DB row) are ignored, never surfaced as a chip. */
export function allowedPositions(extra: readonly string[]): TextPosition[] {
  const offered: TextPosition[] = (["top", "bottom"] as const).filter((p) => extra.includes(p));
  return ["centre", ...offered, "back"];
}

/** `pos` if the design actually offers it, else `centre` (0.1-4): a shared
 *  link asking for a position this design doesn't have doesn't break and
 *  doesn't invent an arc — it just falls back, silently. */
export function clampPosition(pos: TextPosition, allowed: readonly TextPosition[]): TextPosition {
  return allowed.includes(pos) ? pos : "centre";
}

export function isTextPosition(v: unknown): v is TextPosition {
  return typeof v === "string" && (TEXT_POSITIONS as readonly string[]).includes(v);
}
