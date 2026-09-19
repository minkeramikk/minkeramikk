/**
 * Palette store (R5-PALETTES). Pure, serializable, no React, no localStorage
 * here — the hook that persists it is a later task and must find nothing to
 * decide: every rule (dedup, eviction, rename) lives in this file.
 *
 * A palette is identified by its config `code` — same code, same colours, by
 * construction (the code IS the encoding of the selections). Saving a code
 * that's already kept is therefore a re-use, not a new palette: it keeps the
 * customer's own name and only bumps `usedAt`, the LRU key MAX_PALETTES
 * evicts on.
 */
import type { ConfigSnapshot, CartLayer } from "@/lib/cart/cart";
import { paletteWords, type PaletteFamily, type PaletteWords } from "./name-lists";

export interface Palette {
  code: string; // the config code — the palette's identity
  name: string; // nameFor(), or the customer's rename
  designSlug: string;
  snapshot: ConfigSnapshot;
  layers: CartLayer[];
  createdAt: number; // epoch ms
  usedAt: number; // epoch ms — LRU key
}

export const MAX_PALETTES = 10;

/**
 * Save (or re-save) a palette. An existing code keeps its `name` and
 * `createdAt` — the customer's rename survives — and only `usedAt` moves;
 * `snapshot`/`layers` are identical by construction so overwriting them is
 * harmless either way. A brand-new code is appended, then the list is
 * trimmed to MAX_PALETTES by evicting the least-recently-used (lowest
 * `usedAt`) entries first.
 */
export function savePalette(list: Palette[], p: Palette): Palette[] {
  const existing = list.find((x) => x.code === p.code);
  const next = existing
    ? list.map((x) =>
        x.code === p.code ? { ...x, usedAt: p.usedAt } : x
      )
    : [...list, p];

  if (next.length <= MAX_PALETTES) return next;
  const keep = [...next].sort((a, b) => b.usedAt - a.usedAt).slice(0, MAX_PALETTES);
  const keepCodes = new Set(keep.map((x) => x.code));
  return next.filter((x) => keepCodes.has(x.code));
}

/** Rename a palette. A blank (post-trim) name is ignored — the old name stands. */
export function renamePalette(list: Palette[], code: string, name: string): Palette[] {
  const trimmed = name.trim();
  if (!trimmed) return list;
  return list.map((p) => (p.code === code ? { ...p, name: trimmed } : p));
}

/** Bump a palette's LRU key without touching anything else. */
export function touchPalette(list: Palette[], code: string, at: number): Palette[] {
  return list.map((p) => (p.code === code ? { ...p, usedAt: at } : p));
}

export function paletteFor(list: Palette[], code: string): Palette | null {
  return list.find((p) => p.code === code) ?? null;
}

/**
 * Delete a palette by code. No confirmation dialog anywhere this is called
 * from (TL ruling, R5-PALETTES follow-up): a palette is a deterministic
 * function of its colours (`nameFor`/the code itself), so deleting one loses
 * nothing that re-picking the same colours wouldn't reproduce with the same
 * name — same reasoning `renamePalette` already leans on to skip a confirm
 * step. A code not in the list is a no-op (e.g. a cross-tab delete already
 * removed it) — returns the SAME reference, like `renamePalette` does for a
 * blank name, so callers can cheaply tell nothing changed.
 */
export function deletePalette(list: Palette[], code: string): Palette[] {
  return list.some((p) => p.code === code) ? list.filter((p) => p.code !== code) : list;
}

/**
 * Card §4-bis, "Aggiunto in corsa alla PR 2" (18/9): everywhere a list of
 * palettes renders — bar, tab, Sheet — the current design's own palettes
 * lead, every other design's follow (dimmed by the caller, not dropped
 * here). A STABLE sort, not a filter: `Array.prototype.sort` is stable in
 * every engine this project targets, so it only reorders the two buckets
 * against each other — relative order within each bucket is whatever the
 * caller already had (LRU/creation order, untouched). Copies before
 * sorting: every other function in this file returns a new array too, and
 * `.sort()` mutates in place.
 */
export function sortCurrentDesignFirst(list: Palette[], currentSlug: string): Palette[] {
  return [...list].sort(
    (a, b) => Number(a.designSlug !== currentSlug) - Number(b.designSlug !== currentSlug)
  );
}

/**
 * Bucket a hex colour into a pigment family by hue, with a `neutral`
 * catch-all for anything with too little saturation to have a real hue
 * (greys, near-black, near-white — the "no saturation ⇒ no hue" case).
 * Boundaries split the wheel roughly where a maiolica painter would: blue
 * 190-259, purple 260-319, red 320-19 (wraps through 0), yellow 20-69,
 * green 70-189.
 */
export function paletteFamily(hex: string): PaletteFamily {
  const hsl = hexToHsl(hex);
  if (!hsl) return "neutral"; // malformed input — never throw, never fake a hue
  const { s, l, h } = hsl;
  if (s < 0.15 || l < 0.06 || l > 0.94) return "neutral";
  if (h >= 190 && h < 260) return "blue";
  if (h >= 260 && h < 320) return "purple";
  if (h >= 20 && h < 70) return "yellow";
  if (h >= 70 && h < 190) return "green";
  return "red"; // 320-360 or 0-20
}

// Only the 6-digit form: every hex this module ever sees comes off a design's
// own colour options in the DB, which are always #rrggbb — the 3-digit short
// form isn't part of that vocabulary, so it isn't worth the extra branch.
const HEX_6 = /^#?[0-9a-f]{6}$/i;

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  if (!HEX_6.test(hex)) return null;
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * The design's main-colour category, matched by DISPLAY LABEL (the
 * snapshot doesn't carry the URL slug `opt_colors`) — EXACT match,
 * case-insensitively and trimmed, against a small known vocabulary. A
 * substring match ("colour" inside "Edge colour") would let an unrelated
 * colour-ish category outrank the real one when it happens to sort first in
 * `selections[]` — a confident wrong answer, not the graceful fallback
 * below. Extend this set when a new supplier brings a new spelling; a
 * design whose main category matches none of them falls back to the first
 * hexed selection instead (nameFor()).
 */
const MAIN_COLOUR_LABELS = new Set(["hovedfarge", "colour", "color"]);

function isMainColourLabel(label: string | undefined): boolean {
  if (!label) return false;
  return MAIN_COLOUR_LABELS.has(label.trim().toLowerCase());
}

// Small FNV-1a (32-bit) — deterministic code → index, no dependency.
// Exported: text-segment.ts (R5-TEXT-IDENTITY) reuses it for hashNote rather
// than adding a second hash function to the codebase.
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Derive the palette's name from its colours: pick the main-colour
 * category's hex if the design has one, else the first selection with a
 * hex, else `neutral`; then a deterministic word from that family — never
 * the colour's own name in front of it (card §4-bis).
 *
 * `taken` (round 4, TL-reported duplicate «Zaffera») is every name already
 * in use — pass the caller's current saved-palette names so two different
 * codes in the same family can't collide on the same word. With no `taken`
 * (or none of it in the way) this returns EXACTLY what it always did: the
 * hashed index is still `i=0` of the walk below, so an uncontested palette
 * is byte-for-byte unchanged. Compared trimmed + lower-cased, so a
 * customer's own rename ("zaffera") blocks the word it collides with too.
 *
 * `code` IS HASHED VERBATIM — this function does not know about the
 * inscription/wish segment `text-segment.ts` can append (importing
 * `stripCustomSegment`, `set-code.ts` → `config-code.ts` → `text-segment.ts`
 * → this file for `fnv1a`, would be the exact import cycle that module's own
 * comment exists to avoid). R5-TEXT-IDENTITY (TL ruling, "the name is
 * noise"): every caller that can carry a dedication in its code MUST strip
 * it first (the same single `stripCustomSegment` everything else uses) —
 * the palette's NAME is a function of its colours alone, never of what the
 * customer typed, or it renames itself on every keystroke. Passing an
 * unstripped code is a caller bug, not a variant this function supports.
 */
export function nameFor(
  code: string,
  snapshot: ConfigSnapshot,
  words: PaletteWords = paletteWords(),
  taken: string[] = []
): string {
  const main = snapshot.selections.find(
    (sel) => isMainColourLabel(sel.label) || isMainColourLabel(sel.labelEn)
  );
  const chosen = main?.hex ? main : snapshot.selections.find((sel) => sel.hex);
  const family: PaletteFamily = chosen?.hex ? paletteFamily(chosen.hex) : "neutral";
  const list = words[family];
  const start = fnv1a(code) % list.length;
  const baseWord = list[start];

  const takenSet = new Set(taken.map((n) => n.trim().toLowerCase()));
  const isFree = (name: string) => !takenSet.has(name.trim().toLowerCase());

  // Walk the family's word list forward from the hashed index, wrapping.
  // i=0 is `baseWord` — the exact word today's callers already get — so an
  // uncontested palette never moves; a collision just steps to the next
  // word instead of repeating it.
  for (let i = 0; i < list.length; i++) {
    const word = list[(start + i) % list.length];
    if (isFree(word)) return word;
  }

  // Every word in the family is taken — needs MAX_PALETTES (10) saves to
  // exhaust a 5-word family, so this is rare. Card §2 forbids a number, so
  // qualify the hashed word with a REAL colour name off the snapshot
  // instead: the main colour first ("Zaffera Blu"), then any other
  // coloured selection, in snapshot order, until one is free.
  const others = snapshot.selections.filter((sel) => sel.hex && sel !== chosen);
  const qualifiers = chosen?.hex ? [chosen, ...others] : others;
  let qualified = baseWord;
  for (const sel of qualifiers) {
    qualified = `${baseWord} ${sel.option}`;
    if (isFree(qualified)) return qualified;
  }
  // ponytail: last-resort duplicate — every qualified variant ALSO taken
  // (or there was no colour to qualify with at all). Still name-shaped, no
  // number, which is all card §2 requires; reaching here needs a
  // pathological all-taken family plus an all-taken qualifier walk too.
  return qualified;
}
