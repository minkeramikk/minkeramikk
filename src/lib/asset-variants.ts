/**
 * F26: naming + classification for image variants in the `assets` bucket.
 *
 * A variant is a resized WebP stored NEXT TO its master, same folder,
 * `@<width>` suffix:
 *   swatches/a3759f.png              → swatches/a3759f@96.webp
 *   designs/amalfi-dyr/dots/lilla.png → designs/amalfi-dyr/dots/lilla@512.webp
 * Masters are never touched — lab-PDF (F08) and compose-plate keep downloading
 * the full-res originals straight from Storage.
 *
 * Shared by the app (assetUrl) AND the backfill script
 * (scripts/generate-asset-variants.mjs), which imports this file directly —
 * Node 24 strips types natively, so keep the syntax erasable (no enums).
 */

/** `…@512.webp` — an object that already IS a variant. */
export const VARIANT_SUFFIX_RE = /@\d+\.webp$/;

export function isVariantPath(path: string): boolean {
  return VARIANT_SUFFIX_RE.test(path);
}

export type AssetClass = "swatches" | "animal" | "products" | "designs";

/** Display width per class (Lighthouse: largest real display size, ×2 for DPR). */
export const VARIANT_WIDTHS: Record<AssetClass, number> = {
  swatches: 96, // 40px swatch circles, shared library (F15)
  animal: 128, // 56px animal icons
  products: 256, // 64px product/supplier thumbs (photos)
  designs: 512, // was 800 — hero compositing layers + design previews, flat
  // tints displayed at 312px (mobile) / 417px (desktop) (F26.1)
};

/** Compositing layers inside an animal category folder: `-layer` is the admin
 *  upload convention (options-actions.ts), `-shape` the legacy import naming. */
const ANIMAL_LAYER_RE = /-(layer|shape)\.(png|jpe?g|webp)$/i;

/**
 * Classify a Storage path. Animal icons live under the category folder, which
 * is slugged "dyr" by the F22 template and "animal" when created by hand from
 * the EN label — match both. The SAME folder also holds the animal compositing
 * layers (`…-layer.png` / legacy `…-shape.png`, 1500² masters composed in the
 * hero preview): those are design layers → 512, only the 56px grid icons
 * stay at 128. External URLs and existing variants → null.
 */
export function assetClass(path: string): AssetClass | null {
  if (/^https?:\/\//i.test(path)) return null;
  if (isVariantPath(path)) return null;
  if (path.startsWith("swatches/")) return "swatches";
  // F35: per-supplier glaze swatches — same 96px class as the shared swatches lib.
  if (/^suppliers\/[^/]+\/colors\//.test(path)) return "swatches";
  if (path.startsWith("products/")) return "products";
  if (/^designs\/[^/]+\/(animal|dyr)\//.test(path)) {
    return ANIMAL_LAYER_RE.test(path) ? "designs" : "animal";
  }
  if (path.startsWith("designs/")) return "designs";
  return null;
}

/** Variant width for a path, or null if the path has no variant class. */
export function variantWidth(path: string): number | null {
  const cls = assetClass(path);
  return cls ? VARIANT_WIDTHS[cls] : null;
}

/**
 * Variant object path for a master: extension → `@<width>.webp`.
 * Null when the path has no recognizable image extension.
 */
export function variantPath(path: string, width: number): string | null {
  if (!/\.(png|jpe?g|webp)$/i.test(path)) return null;
  return path.replace(/\.(png|jpe?g|webp)$/i, `@${width}.webp`);
}
