/**
 * R5-TEXT-CARRY — the dedication IS the palette's identity (this card
 * reverses R5-TEXT-IDENTITY's §3 guard: no more "hide the Save when only the
 * inscription differs"). «Save as palette» is offered for every draft
 * EXCEPT the already-saved exact one (`canSaveDraft = !exactMatch`
 * upstream — saving there is a no-op anyway, `savePalette` in
 * `palettes.ts` dedups by exact code, LRU 10 unchanged).
 *
 * Pure, no React — same reason `basket-host.ts`/`featured-strip.ts` exist:
 * `configurator-client.tsx` is a `"use client"` component this repo's Vitest
 * setup can't import (no React test infra, AGENTS.md), so the one piece of
 * this worth unit-testing is pulled out here.
 *
 * Deliberately NOT added to `palettes.ts`: that module is imported by
 * `text-segment.ts` (for `fnv1a`), and `stripCustomSegment` sits on the
 * other side of that same import chain (`set-code.ts` → `config-code.ts` →
 * `text-segment.ts` → `palettes.ts`) — importing it FROM `palettes.ts` would
 * close exactly the kind of cycle this card has already hit and fixed twice
 * (`code-alphabet.ts`'s own doc comment tells that story).
 */

/**
 * The saved palette (of `designSlug`) whose CODE matches `code` exactly, or
 * `null` when none does. R5-TEXT-CARRY: the inscription travels inside the
 * code (`config-code.ts`), so an exact match is the only "already saved" —
 * a draft with a different dedication is unsaved, and Save is offered.
 */
export function paletteMatchingCode<P extends { code: string; designSlug: string }>(
  palettes: P[],
  code: string,
  designSlug: string
): P | null {
  return palettes.find((p) => p.designSlug === designSlug && p.code === code) ?? null;
}

