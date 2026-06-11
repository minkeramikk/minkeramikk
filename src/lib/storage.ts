import { variantPath, variantWidth } from "./asset-variants";

/**
 * Public URLs for the `assets` Storage bucket (TODO 1.4 path convention).
 *
 * F26: paths with a known class (swatches/, products/, designs/…) resolve to
 * their pre-generated `@<width>.webp` variant — resized derivatives stored
 * next to the masters (see asset-variants.ts). Masters stay untouched for
 * lab-PDF / compose-plate, which download them directly from Storage.
 * If a variant is missing (rollout window), the global <img> onError safety
 * net (AssetVariantFallback) swaps back to the master.
 *
 * NOTE: we deliberately do NOT use the `render/image` transform endpoint.
 * On this project it does not preserve aspect ratio (a square 1500×1500
 * source returned 800×1500 for `?width=800`), which distorted the
 * compositing layers and clipped round borders in the preview. Variants are
 * generated with sharp `fit: "inside"` instead, which keeps squares square.
 */
export function assetUrl(path: string, opts?: { width?: number }): string {
  // F22: template seeds can store CDN URLs directly; pass them through unchanged.
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const width = opts?.width ?? variantWidth(path);
  const variant = width ? variantPath(path, width) : null;
  return `${base}/storage/v1/object/public/assets/${variant ?? path}`;
}
