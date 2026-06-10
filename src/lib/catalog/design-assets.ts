/**
 * Design Storage-asset helpers (pure, unit-tested). Decide which assets a design
 * OWNS (so they get copied on clone / removed on delete) vs which are SHARED or
 * external (referenced as-is, never copied or deleted).
 *
 * Path convention (bucket "assets"):
 *   - `designs/<slug>/…`   → owned by that design (bespoke layers, preview)
 *   - `swatches/<hex>.png` → shared library (F15) — never copy/delete
 *   - `https://…`          → external CDN URL — never copy/delete
 */

export function isExternalUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

/** A real object in our Storage bucket (not an absolute CDN URL). */
export function isStoragePath(path: string): boolean {
  return path.length > 0 && !isExternalUrl(path);
}

/** Owned by a specific design = lives under `designs/<slug>/`. */
export function isOwnedByDesign(path: string, slug: string): boolean {
  return isStoragePath(path) && path.startsWith(`designs/${slug}/`);
}

/** Re-path an owned asset into another design's folder; anything not owned by
 *  `fromSlug` (shared/external) is returned unchanged. */
export function remapOwnedAsset(
  path: string,
  fromSlug: string,
  toSlug: string
): string {
  const prefix = `designs/${fromSlug}/`;
  if (isOwnedByDesign(path, fromSlug)) {
    return `designs/${toSlug}/${path.slice(prefix.length)}`;
  }
  return path;
}

export interface AssetCopy {
  from: string;
  to: string;
}

/**
 * Plan the Storage copy for one asset when cloning a design:
 *   - owned by the source → `{ from, to }` (copy to the clone's folder),
 *   - shared/external/empty → `null` (reference as-is, no copy).
 */
export function planAssetCopy(
  path: string | null | undefined,
  fromSlug: string,
  toSlug: string
): AssetCopy | null {
  if (!path || !isOwnedByDesign(path, fromSlug)) return null;
  return { from: path, to: remapOwnedAsset(path, fromSlug, toSlug) };
}

/**
 * The Storage objects to delete when removing a design: only the ones it OWNS
 * (`designs/<slug>/…`). Shared swatches and external URLs are kept. Deduplicated.
 */
export function ownedAssetsToDelete(
  paths: (string | null | undefined)[],
  slug: string
): string[] {
  const set = new Set<string>();
  for (const p of paths) {
    if (p && isOwnedByDesign(p, slug)) set.add(p);
  }
  return [...set];
}
