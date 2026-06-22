import { z } from "zod";

/**
 * R2-3+R2-4 — TYPED product attributes, in one pure place (no React, no DB).
 * Known property types live in a code REGISTRY (extensible without a migration);
 * `custom` keeps a per-product bilingual label. Numeric types carry `valueNum`
 * (weight in grams, diameter in mm) and format via the registry; text types
 * carry `value`. The icon is a NAME the UI maps to a lucide component.
 */

export type AttributeKey = "weight" | "diameter" | "dimensions" | "custom";

export const KNOWN_KEYS = ["weight", "diameter", "dimensions", "custom"] as const;

export const ATTR_LABEL_MAX = 40;
export const ATTR_VALUE_MAX = 120;

export interface TypedAttribute {
  key: AttributeKey;
  /** Only `custom` carries labels; known types take them from the registry. */
  labelNo: string | null;
  labelEn: string | null;
  /** Numeric types: weight=grams, diameter=mm. NULL for text/custom. */
  valueNum: number | null;
  /** Text types (dimensions, custom). NULL for numeric. */
  value: string | null;
}

export interface AttrTypeDef {
  labelNo: string;
  labelEn: string;
  kind: "num" | "text";
  /** Admin input unit hint for numeric types. */
  inputUnit?: string;
  /** Icon name; the UI maps it to a lucide component. */
  icon: AttributeKey;
  /** Shown on the storefront card? `false` = internal/admin-only (e.g. weight,
   *  kept for the future shipping calc, never displayed to the customer). */
  publicVisible: boolean;
}

export const ATTRIBUTE_REGISTRY: Record<AttributeKey, AttrTypeDef> = {
  // weight is INTERNAL (admin-entered, future shipping) — never shown publicly.
  weight: { labelNo: "Vekt", labelEn: "Weight", kind: "num", inputUnit: "g", icon: "weight", publicVisible: false },
  diameter: { labelNo: "Diameter", labelEn: "Diameter", kind: "num", inputUnit: "mm", icon: "diameter", publicVisible: true },
  dimensions: { labelNo: "Mål", labelEn: "Dimensions", kind: "text", icon: "dimensions", publicVisible: true },
  // custom labels come from the product; placeholders here are never shown.
  custom: { labelNo: "", labelEn: "", kind: "text", icon: "custom", publicVisible: true },
};

/**
 * Customer-facing attributes only — drops internal types (currently `weight`,
 * which the admin manages but the storefront never displays). Keeps order.
 */
export function publicAttributes(attrs: TypedAttribute[]): TypedAttribute[] {
  return attrs.filter((a) => ATTRIBUTE_REGISTRY[a.key].publicVisible);
}

function nf(locale: "no" | "en", maxFrac: number): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === "no" ? "nb-NO" : "en-GB", {
    maximumFractionDigits: maxFrac,
  });
}

/** Display label in the locale (registry for known, per-product for custom). */
export function attributeLabel(a: TypedAttribute, locale: "no" | "en"): string {
  if (a.key === "custom") return (locale === "no" ? a.labelNo : a.labelEn) ?? "";
  const def = ATTRIBUTE_REGISTRY[a.key];
  return locale === "no" ? def.labelNo : def.labelEn;
}

/** Display value: weight g→kg, diameter mm→"Ø …cm", text as-is. */
export function formatAttributeValue(a: TypedAttribute, locale: "no" | "en"): string {
  switch (a.key) {
    case "weight":
      return a.valueNum == null ? "" : `${nf(locale, 2).format(a.valueNum / 1000)} kg`;
    case "diameter":
      return a.valueNum == null ? "" : `Ø ${nf(locale, 1).format(a.valueNum / 10)} cm`;
    default:
      return a.value ?? "";
  }
}

/** Show the details affordance only when there's something to show. */
export function hasDetails(
  description: string | null | undefined,
  attrs: TypedAttribute[]
): boolean {
  return Boolean(description?.trim()) || attrs.length > 0;
}

const rawRowSchema = z.object({
  key: z.string(),
  labelNo: z.string().optional(),
  labelEn: z.string().optional(),
  value: z.string().optional(),
  valueNum: z.union([z.number(), z.string()]).optional().nullable(),
});

function coerceInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * Parse the form's single JSON `attributes` field into validated typed rows.
 * `[]` for empty/absent; `null` when the JSON is malformed or any row is invalid
 * (unknown key, missing/invalid numeric value, empty text, custom missing label).
 */
export function parseTypedAttributesField(
  raw: FormDataEntryValue | null
): TypedAttribute[] | null {
  if (raw == null || raw === "") return [];
  let json: unknown;
  try {
    json = JSON.parse(String(raw));
  } catch {
    return null;
  }
  const arr = z.array(rawRowSchema).safeParse(json);
  if (!arr.success) return null;

  const out: TypedAttribute[] = [];
  for (const r of arr.data) {
    if (!(KNOWN_KEYS as readonly string[]).includes(r.key)) return null;
    const key = r.key as AttributeKey;
    const def = ATTRIBUTE_REGISTRY[key];

    if (def.kind === "num") {
      const n = coerceInt(r.valueNum);
      if (n === null) return null;
      out.push({ key, labelNo: null, labelEn: null, valueNum: n, value: null });
    } else if (key === "custom") {
      const labelNo = (r.labelNo ?? "").trim();
      const labelEn = (r.labelEn ?? "").trim();
      const value = (r.value ?? "").trim();
      if (!labelNo || !labelEn || !value) return null;
      if (labelNo.length > ATTR_LABEL_MAX || labelEn.length > ATTR_LABEL_MAX) return null;
      if (value.length > ATTR_VALUE_MAX) return null;
      out.push({ key, labelNo, labelEn, valueNum: null, value });
    } else {
      // dimensions (known text)
      const value = (r.value ?? "").trim();
      if (!value || value.length > ATTR_VALUE_MAX) return null;
      out.push({ key, labelNo: null, labelEn: null, valueNum: null, value });
    }
  }
  return out;
}

/**
 * Rows for the `replace_product_attributes` RPC — WITHOUT `product_id` (the
 * function sets it from its argument). sort_order = position (replace order).
 */
export function buildAttributeRpcRows(attrs: TypedAttribute[]) {
  return attrs.map((a, i) => ({
    key: a.key,
    label_no: a.labelNo,
    label_en: a.labelEn,
    value: a.value,
    value_num: a.valueNum,
    sort_order: i,
  }));
}

/** Embedded DB rows → ordered typed attributes (defensive re-sort). */
export function mapTypedAttributes(
  rows:
    | {
        key: string;
        label_no: string | null;
        label_en: string | null;
        value: string | null;
        value_num: number | null;
        sort_order: number;
      }[]
    | null
): TypedAttribute[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      key: (KNOWN_KEYS as readonly string[]).includes(r.key)
        ? (r.key as AttributeKey)
        : "custom",
      labelNo: r.label_no,
      labelEn: r.label_en,
      valueNum: r.value_num,
      value: r.value,
    }));
}
