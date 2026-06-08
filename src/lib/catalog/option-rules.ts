/**
 * Pure validation rules for configurator options (F10b). No I/O — unit-tested.
 * Mirrors the DB guarantees: CHECK image-or-hex (ADR 0012) + the per-category
 * unique indexes (0009) are enforced in Postgres; these give friendly messages
 * BEFORE hitting the DB.
 */

/** Parse a hex colour field. Empty → valid (null). A 6-digit #rrggbb → valid,
 *  lowercased. Anything else → invalid. */
export function parseHex(raw: string): { ok: boolean; hex: string | null } {
  const v = raw.trim().toLowerCase();
  if (v === "") return { ok: true, hex: null };
  return /^#[0-9a-f]{6}$/.test(v) ? { ok: true, hex: v } : { ok: false, hex: null };
}

/** ADR 0012: an option must carry at least a hex OR an image. */
export function optionAssetError(
  hex: string | null,
  hasImage: boolean
): string | null {
  return !hex && !hasImage
    ? "Provide a hex colour or a swatch image (ADR 0012)."
    : null;
}

/** Map a Postgres unique-violation (0009 indexes) to a human message. */
export function duplicateOptionMessage(constraintText: string): string {
  if (constraintText.includes("hex"))
    return "A colour with this hex already exists in this category.";
  if (constraintText.includes("name"))
    return "An option with this name already exists in this category.";
  return "This option duplicates an existing one in the category.";
}
