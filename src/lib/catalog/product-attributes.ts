import { z } from "zod";

/**
 * R2-4a — product attributes as DATA (one row per attribute), in one pure
 * place: no React, no DB. Labels are bilingual per product (decision
 * 2026-06-20); `value` is free text (weight stays "1,2 kg" text, not a
 * structured weight_g — out of scope until shipping calc, ADR 0015).
 */

/** Cap on a single attribute value (admin form + server share this). */
export const ATTR_VALUE_MAX = 120;

export interface ProductAttribute {
  labelNo: string;
  labelEn: string;
  value: string;
}

const rowSchema = z.object({
  labelNo: z.string().trim().min(1),
  labelEn: z.string().trim().min(1),
  value: z.string().trim().min(1).max(ATTR_VALUE_MAX),
});

export const attributesSchema = z.array(rowSchema);

/**
 * Parse the form's single JSON `attributes` field. `[]` for an absent/empty
 * field; `null` when the JSON is malformed or any row is invalid (the caller
 * turns `null` into a user-facing error).
 */
export function parseAttributesField(
  raw: FormDataEntryValue | null
): ProductAttribute[] | null {
  if (raw == null || raw === "") return [];
  let json: unknown;
  try {
    json = JSON.parse(String(raw));
  } catch {
    return null;
  }
  const parsed = attributesSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** DB rows for an INSERT, sort_order = position (replace semantics). */
export function buildAttributeRows(
  productId: string,
  attrs: ProductAttribute[]
) {
  return attrs.map((a, i) => ({
    product_id: productId,
    label_no: a.labelNo,
    label_en: a.labelEn,
    value: a.value,
    sort_order: i,
  }));
}

/** Embedded DB rows → ordered camelCase attributes (defensive re-sort). */
export function mapAttributes(
  rows:
    | { label_no: string; label_en: string; value: string; sort_order: number }[]
    | null
): ProductAttribute[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({ labelNo: r.label_no, labelEn: r.label_en, value: r.value }));
}

/** Show the "i" icon only when there is something to show (no empty popover). */
export function hasProductInfo(
  description: string | null | undefined,
  attributes: ProductAttribute[]
): boolean {
  return Boolean(description?.trim()) || attributes.length > 0;
}
