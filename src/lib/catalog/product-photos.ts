/**
 * R4-STEP3: gallery photos of a ceramic (ADR 0020). Max 2 by product decision —
 * the cap lives here and in the admin server action, never in the schema.
 */
export const MAX_PRODUCT_PHOTOS = 2;

export function orderedProductPhotos(
  rows: { image: string; sort_order: number }[] | null | undefined
): string[] {
  if (!Array.isArray(rows)) return [];
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, MAX_PRODUCT_PHOTOS)
    .map((r) => r.image);
}

/**
 * What the product sheet actually shows. Zero photos is the NORMAL state until
 * Alessio uploads them, so it must degrade to exactly what step 3 shows today:
 * the catalog thumb. No thumb either (a product with no image at all) → the
 * photo block disappears, it never renders an empty frame.
 */
export function displayPhotos(
  photos: string[] | null | undefined,
  image: string | null
): string[] {
  if (Array.isArray(photos) && photos.length > 0) return photos;
  return image ? [image] : [];
}
