/**
 * Slug helpers for the catalog (F09). Same normalization as the import script
 * (Norwegian å/ø/æ folded), so admin-created and imported products share one
 * convention. The slug is the product's permanent unique key.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A slug for `name` that does not collide with `taken`. Appends -2, -3, … until
 * free. `taken` should exclude the row being edited (so re-saving keeps its slug).
 */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const base = slugify(name) || "item";
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!set.has(candidate)) return candidate;
  }
}
