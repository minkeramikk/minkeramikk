/**
 * R5-DESIGN-SWITCH task 3 (AC4) — dim-palette tap params. Pure, no React:
 * `configurator-client.tsx` is `"use client"` and unimportable in Vitest,
 * same reason `save-gate.ts`/`basket-host.ts` exist.
 *
 * A dim palette belongs to ANOTHER design; tapping it switches design
 * implicitly through the SAME `?code=` navigation the decode paths already
 * resolve (the F19 effect in `configurator-client.tsx`, `page.tsx` step 3) —
 * never a new navigation shape. The caller resolves `designSlug` (step 2
 * decodes the code with the existing codec, step 3 reads the palette's own
 * store-written `designSlug`) and this sets it upfront, so no render runs
 * with the stale design first; `opt_*` (the old design's categories) and
 * `text=` (the old dedication — the code carries the tapped palette's own)
 * drop with it. `note=` and everything else ride along untouched (the colour
 * wish travels only in the URL, never in the code).
 *
 * `designSlug` null = the code resolved to nothing (tolerant decode, never
 * throws): only `code=` is set and the existing decode effects handle the
 * rest exactly like before — a tap never loses the on-screen config over an
 * undecodable code.
 */
export function buildDesignSwitchParams(
  current: URLSearchParams,
  code: string,
  designSlug: string | null
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set("code", code);
  next.delete("text");
  if (designSlug) {
    next.set("design", designSlug);
    for (const key of [...next.keys()]) {
      if (key.startsWith("opt_")) next.delete(key);
    }
  }
  return next;
}
