/**
 * Configuration code grammar (ADR 0011). Pure, no DB, no React.
 *
 *   MK-<D>-<s1>-<s2>-…-<sN>
 *
 * `<D>` = designs.code; each `<sK>` = options.code of the selected option in a
 * category, segments ordered by `option_categories.slug` ascending (the slug is
 * stable; sort_order is not). The code is self-contained and canonical: it is
 * what F05 stores in `order_items.config_code` and what F08 prints.
 *
 * Alphabet: A–Z + 2–9, excluding the ambiguous `0 O 1 I L`. Decode is tolerant
 * and NEVER throws in a way that crashes the page.
 */

/** Safe alphabet (ADR 0011): A–Z minus O,I,L, plus 2–9. 31 symbols. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_PREFIX = "MK";

/** Minimal catalog shape the codec needs (from the DB, no UI types). */
export interface CodecCategory {
  slug: string;
  /** option.code → option.id, for this category */
  optionCodeToId: Record<string, string>;
  /** default option id (first active by sort_order) */
  defaultOptionId: string | null;
}

export interface CodecDesign {
  code: string;
  slug: string;
  /** categories of this design (any order; the codec sorts by slug) */
  categories: CodecCategory[];
}

/** A resolved selection: design slug + option id per category slug. */
export interface DecodedSelection {
  designSlug: string;
  selections: Record<string, string>; // categorySlug → optionId
}

export class ConfigCodeError extends Error {}

const sorted = (cats: CodecCategory[]) =>
  [...cats].sort((a, b) => a.slug.localeCompare(b.slug));

/**
 * Build a CodecDesign from the DB-shaped design detail. Shared by the UI
 * (encode current code) and decode (findDesignByCode over all designs).
 */
export function toCodecDesign(detail: {
  code: string | null;
  slug: string;
  categories: {
    slug: string;
    options: { id: string; code: string | null }[];
  }[];
}): CodecDesign | null {
  if (!detail.code) return null;
  return {
    code: detail.code,
    slug: detail.slug,
    categories: detail.categories.map((c) => {
      const optionCodeToId: Record<string, string> = {};
      for (const o of c.options) if (o.code) optionCodeToId[o.code] = o.id;
      return {
        slug: c.slug,
        optionCodeToId,
        defaultOptionId: c.options[0]?.id ?? null,
      };
    }),
  };
}

/**
 * Build the canonical code from the current selections.
 * @param design the chosen design (with its categories + code maps)
 * @param selections categorySlug → optionId (missing → category default)
 */
export function encodeConfigCode(
  design: CodecDesign,
  selections: Record<string, string>
): string {
  const idToCode = (cat: CodecCategory): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [code, id] of Object.entries(cat.optionCodeToId)) out[id] = code;
    return out;
  };

  const segments = sorted(design.categories).map((cat) => {
    const optId = selections[cat.slug] ?? cat.defaultOptionId;
    const code = optId ? idToCode(cat)[optId] : undefined;
    // unknown/absent selection falls back to the default option's code
    if (code) return code;
    const def = cat.defaultOptionId ? idToCode(cat)[cat.defaultOptionId] : "";
    return def;
  });

  return [CODE_PREFIX, design.code, ...segments].join("-");
}

/** Normalize raw user input: uppercase, strip noise, collapse separators. */
export function normalizeConfigCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "") // drop spaces/punctuation
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Decode a code into a design slug + per-category selections.
 * Tolerant (ADR 0011): missing segment → category default; extra segments →
 * ignored; unknown option code → default; unknown design or malformed → throws
 * ConfigCodeError (callers show a gentle message, never crash).
 *
 * @param findDesignByCode resolves `<D>` → the design (or null)
 */
export function decodeConfigCode(
  raw: string,
  findDesignByCode: (code: string) => CodecDesign | null
): DecodedSelection {
  const norm = normalizeConfigCode(raw);
  if (!norm) throw new ConfigCodeError("empty");

  const parts = norm.split("-");
  // tolerate a missing/!= prefix: only consume it if present
  if (parts[0] === CODE_PREFIX) parts.shift();

  const designCode = parts.shift();
  if (!designCode) throw new ConfigCodeError("no design");

  const design = findDesignByCode(designCode);
  if (!design) throw new ConfigCodeError(`unknown design: ${designCode}`);

  const cats = sorted(design.categories);
  const selections: Record<string, string> = {};
  cats.forEach((cat, i) => {
    const seg = parts[i]; // may be undefined (missing) → default
    const fromCode = seg ? cat.optionCodeToId[seg] : undefined;
    const id = fromCode ?? cat.defaultOptionId;
    if (id) selections[cat.slug] = id;
  });
  // extra segments (parts beyond cats.length) are simply ignored

  return { designSlug: design.slug, selections };
}
