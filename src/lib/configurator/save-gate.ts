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
 * (`code-alphabet.ts`'s own doc comment tells that story). This file is only
 * ever imported by a leaf (the configurator client component), so it can
 * safely depend on both `palettes.ts`'s shape and `set-code.ts`'s codec.
 */
import { stripCustomSegment } from "@/lib/cart/set-code";

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

/**
 * The saved palette (of `designSlug`) whose COLOURS — the code with any
 * inscription/colour-wish segment stripped — match `code`'s, or `null` when
 * none does. `selectionCount` is the design's own category count
 * (`detail.categories.length` at step 2; `snapshot.selections.length` at
 * step 3, same value by construction — `buildConfigLinePayload` builds
 * `selections` one entry per category), the same value `set-code.ts`'s own
 * callers read off a snapshot.
 *
 * Final-review round 2, finding 3 — "which palette is painting" is a
 * question about COLOURS: an exact-code match (`p.code === code`) stops
 * working the moment the code also carries an inscription, because typing
 * any dedication changes `code` while a saved palette's own stored code
 * doesn't move. Without this, tapping a saved palette (or just having its
 * colours on screen) while a dedication is typed shows no active state —
 * wrongly, since the customer's words are exactly what's SUPPOSED to make
 * this a different identity for SAVING (see `paletteMatchingCode` above),
 * not for recognising which colours are already on screen.
 */
export function paletteMatchingColours<P extends { code: string; designSlug: string }>(
  palettes: P[],
  code: string,
  designSlug: string,
  selectionCount: number
): P | null {
  const targetColours = stripCustomSegment(code, selectionCount);
  return (
    palettes.find(
      (p) =>
        p.designSlug === designSlug &&
        stripCustomSegment(p.code, selectionCount) === targetColours
    ) ?? null
  );
}

