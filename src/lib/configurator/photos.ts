/**
 * F36: does a design have gallery photos to show at step 2?
 *
 * Resilient to a MISSING `images` field, not just an empty one: a stale
 * `unstable_cache` entry from before F36 added `images` to the DTO serves an
 * object with no `images` key at all, so `detail.images.length` would throw in
 * the client. This predicate treats absent/empty/null all as "no photos" so the
 * strip degrades cleanly (AC: zero photos → no strip container, no fades, no
 * arrows, layout identical to pre-F36).
 */
export function hasPhotos(images: string[] | null | undefined): boolean {
  return Array.isArray(images) && images.length > 0;
}

/**
 * F41: which lightbox slide is in view, from the scroller's position.
 *
 * Slides are exactly one scroller-width wide, so it's a rounded division —
 * with the two guards that bite in practice: `clientWidth` is 0 before the
 * first layout pass (and in jsdom), and iOS rubber-band scrolling overshoots
 * past the last slide.
 */
export function photoIndexAt(
  scrollLeft: number,
  clientWidth: number,
  count: number,
): number {
  if (clientWidth <= 0) return 0;
  const i = Math.round(scrollLeft / clientWidth);
  return Math.min(Math.max(i, 0), Math.max(count - 1, 0));
}
