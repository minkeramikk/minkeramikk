import { uniqueSlug } from "./slug";

/**
 * F39 — the catalog columns a cloned ceramic carries over. Listed explicitly,
 * column by column, so a future column addition shows up as a type error here
 * instead of being silently dropped from every clone.
 */
export interface CloneSource {
  name_no: string;
  name_en: string;
  description_no: string | null;
  description_en: string | null;
  price_cents: number;
  currency: string;
  image: string | null;
  pieces: number;
}

/** Insert payload for the clone. `id` is left to the DB default. */
export interface ProductCloneRow extends CloneSource {
  slug: string;
  supplier_id: string;
  visible: false;
  sort_order: number;
}

/**
 * Build the row for a ceramic cloned onto another supplier (card §2).
 *
 * - slug: new and unique — slugified from name_no, same key saveProduct uses.
 * - image: the SAME Storage path, deliberately shared (v1). Re-uploading the
 *   photo on either row writes a fresh token'd path (F35 cache-busting), so the
 *   two rows diverge by themselves the moment one of them is edited.
 * - visible: false — a clone is a draft until the admin reviews the new lab's
 *   price. Never publish a ceramic at another supplier's price by accident.
 */
export function buildProductClone(
  src: CloneSource,
  targetSupplierId: string,
  takenSlugs: Iterable<string>,
  sortOrder: number
): ProductCloneRow {
  return {
    name_no: src.name_no,
    name_en: src.name_en,
    description_no: src.description_no,
    description_en: src.description_en,
    price_cents: src.price_cents,
    currency: src.currency,
    image: src.image,
    pieces: src.pieces,
    slug: uniqueSlug(src.name_no, takenSlugs),
    supplier_id: targetSupplierId,
    visible: false,
    sort_order: sortOrder,
  };
}

/** AC2: warn (never block) when the target supplier already has this name. */
export function nameClashes(nameNo: string, existingNames: string[]): boolean {
  const n = nameNo.trim().toLowerCase();
  return existingNames.some((e) => e.trim().toLowerCase() === n);
}
