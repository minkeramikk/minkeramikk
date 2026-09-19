/**
 * What kind of pointer is driving this session. Lifted out of
 * `components/ui-domain/hover-preview.tsx` (R5-BASKET-HOST PR 2) once a second
 * consumer appeared: a cart context importing a predicate from a hover-preview
 * component is a coupling nobody would look for.
 *
 * Flat in `lib/`, like `storage.ts` / `theme.ts` / `site.ts` — one purpose, no
 * folder of its own.
 *
 * SSR: `window` and `matchMedia` do not exist on the server, and this module is
 * imported by components that render there, so both are checked. On the server
 * — and in any browser too old for `matchMedia` — the answer is `false`, i.e.
 * «assume touch», which is the safe default for both callers: the hover preview
 * simply does not arm, and the basket keeps its keyboard guard.
 */
export function hoverCapable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
  );
}
