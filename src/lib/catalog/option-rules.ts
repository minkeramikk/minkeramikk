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

/** ADR 0018 two-way form: a colour option must reference a palette colour; an
 *  image option must carry an image. (Replaces the old image-or-hex rule.) */
export function optionShapeError(
  kind: "color" | "image",
  opts: { supplierColorId: string | null; hasImage: boolean }
): string | null {
  if (kind === "color")
    return opts.supplierColorId ? null : "Pick a glaze colour for this option.";
  return opts.hasImage ? null : "Provide a swatch/layer image for this option.";
}

/** Map a Postgres unique-violation (0009 + 0022 indexes) to a human message. */
export function duplicateOptionMessage(constraintText: string): string {
  if (constraintText.includes("supplier_color"))
    return "This glaze colour is already used in this category.";
  if (constraintText.includes("hex"))
    return "A colour with this hex already exists in this category.";
  if (constraintText.includes("name"))
    return "An option with this name already exists in this category.";
  return "This option duplicates an existing one in the category.";
}
