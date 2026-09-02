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

export type AssetClass =
  | "swatches"
  | "animal"
  | "products"
  | "designs"
  | "design-photos"
  | "product-photos";

/** Display width per class (Lighthouse: largest real display size, ×2 for DPR). */
export const VARIANT_WIDTHS: Record<AssetClass, number> = {
  swatches: 96, // 40px swatch circles, shared library (F15)
  animal: 128, // 56px animal icons
  // R4-STEP3-FIX: the product-sheet main frame shows this photo at ~420px ×
  // DPR2 — 256 (the old 64px thumb budget) was visibly soft. Same order as
  // `product-photos` below. The smaller consumers ask for their width
  // explicitly: PRODUCT_CARD_WIDTH (step-3 card), PRODUCT_THUMB_WIDTH (48px
  // cart plate, admin lists).
  products: 1024,
  designs: 512, // was 800 — hero compositing layers + design previews, flat
  // tints displayed at 312px (mobile) / 417px (desktop) (F26.1)
  "design-photos": 1024, // F36 lifestyle gallery strip (~350px × DPR2 + headroom)
  // R4-STEP3: gallery photos of a ceramic (modal ~420px, lightbox full-screen),
  // same budget as the F36 design gallery.
  "product-photos": 1024,
};

/**
 * Small product thumb: cart plate (48px), admin lists (36-80px). Passed as an
 * explicit `width` to assetUrl — the `products` class width itself serves the
 * big product-sheet / lightbox image.
 */
export const PRODUCT_THUMB_WIDTH = 256;

/**
 * R4-IMG-512: the step-3 catalogue card. Its square frame is ~180px at 390 (2
 * columns) and ~300px from 960 up (3 columns) — 360-600px at DPR2, where the
 * class width serves 1024. Every card in the viewport paid 80-150 KB for a
 * photo it downscales by half. Requested explicitly by `CeramicCard`; the
 * sheet and the lightbox keep the class width, which is what they display.
 */
export const PRODUCT_CARD_WIDTH = 512;

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
  if (path.startsWith("design-photos/")) return "design-photos";
  if (path.startsWith("product-photos/")) return "product-photos";
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

/**
 * Every width to pre-generate for a master. One per class, plus — for a
 * product photo — the two widths the app asks for explicitly: the step-3 card
 * (PRODUCT_CARD_WIDTH) and the 48px cart plate / admin lists
 * (PRODUCT_THUMB_WIDTH). Class width first, then descending.
 */
export function variantWidths(path: string): number[] {
  const width = variantWidth(path);
  if (!width) return [];
  return assetClass(path) === "products"
    ? [width, PRODUCT_CARD_WIDTH, PRODUCT_THUMB_WIDTH]
    : [width];
}
