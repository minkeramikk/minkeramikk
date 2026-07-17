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
