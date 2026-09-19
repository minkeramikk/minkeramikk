/**
 * R5-TEXT-IDENTITY (card §3 guard, TL ruling 19/9) — «Save as palette» is
 * NOT offered when the draft differs from an already-saved palette ONLY by
 * the inscription (or the colour wish). Without this, once the code itself
 * carries the customer's words (task 2/4), typing six different dedications
 * for a gift set — same colours every time — would fill the ten-palette LRU
 * (`palettes.ts`, `MAX_PALETTES`) with six near-duplicate entries and scroll
 * real, distinct palettes out of it. That's the exact consequence
 * `docs/revision5/R5-CONFIG-CARRY.md` §3 says to decide before closing this
 * card; the TL's ruling is: hide the offer, never delete or rename anything.
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
 * this a different identity for SAVING (the §3 guard above), not for
 * recognising which colours are already on screen.
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

/**
 * True when `draftCode`'s colours already match a saved palette of the SAME
 * design — however many different dedications away. See card §3 guard
 * (TL ruling) at the top of this file for why.
 */
export function draftMatchesSavedColours(
  palettes: { code: string; designSlug: string }[],
  draftCode: string,
  designSlug: string,
  selectionCount: number
): boolean {
  return paletteMatchingColours(palettes, draftCode, designSlug, selectionCount) !== null;
}
