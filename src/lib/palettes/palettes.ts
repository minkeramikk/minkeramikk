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
