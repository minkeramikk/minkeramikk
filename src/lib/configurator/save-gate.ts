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
 * True when `draftCode`'s COLOURS (the code with any inscription/colour-wish
 * segment stripped) already match a saved palette of the SAME design —
 * however many different dedications away. `selectionCount` is the design's
 * own category count (`detail.categories.length`), the same value
 * `set-code.ts`'s callers read off a snapshot; here the caller already has
 * the live design detail, so it's read directly, no snapshot needed.
 */
export function draftMatchesSavedColours(
  palettes: { code: string; designSlug: string }[],
  draftCode: string,
  designSlug: string,
  selectionCount: number
): boolean {
  const draftColours = stripCustomSegment(draftCode, selectionCount);
  return palettes.some(
    (p) =>
      p.designSlug === designSlug &&
      stripCustomSegment(p.code, selectionCount) === draftColours
  );
}
