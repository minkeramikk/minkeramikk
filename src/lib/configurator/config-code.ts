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

import { pickDefaultOption } from "./default-option";
import { decodeTextSegment, encodeTextSegment, hashNote } from "./text-segment";
import { CODE_ALPHABET, CODE_PREFIX } from "./code-alphabet";

// Re-exported so today's importers (assign-codes.ts, assign-codes.test.ts,
// set-code.test.ts) keep reading the alphabet from here, unchanged. The
// canonical definition lives in ./code-alphabet, which text-segment.ts also
// imports directly — see that module's doc comment for why it had to move.
export { CODE_ALPHABET, CODE_PREFIX };

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
  /**
   * R5-TEXT-IDENTITY (task 2): the customer's inscription, when the code
   * carries one. Absent (not `""`) when there is none, or when the
   * inscription segment was missing/unreadable — decode degrades to "no
   * inscription" rather than throwing (see decodeConfigCode). The colour
   * WISH hash that travels alongside it in the same segment is identity
   * only: it is never surfaced here, so nothing downstream can act on it.
   */
  customText?: string;
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
    options: { id: string; code: string | null; isDefault?: boolean }[];
  }[];
}): CodecDesign | null {
  if (!detail.code) return null;
  return {
    code: detail.code,
    slug: detail.slug,
    categories: detail.categories.map((c) => {
      const optionCodeToId: Record<string, string> = {};
      for (const o of c.options) if (o.code) optionCodeToId[o.code] = o.id;
      // cover/code default = the option flagged is_default, else first-by-sort_order.
      // The caller passes options pre-sorted, so config codes stay stable (ADR 0011)
      // when nothing is flagged (pre-R2-1 behaviour preserved).
      return {
        slug: c.slug,
        optionCodeToId,
        defaultOptionId: pickDefaultOption(c.options)?.id ?? null,
      };
    }),
  };
}

/**
 * Build the canonical code from the current selections.
 * @param design the chosen design (with its categories + code maps)
 * @param selections categorySlug → optionId (missing → category default)
 * @param extras R5-TEXT-IDENTITY (task 2): the customer's own words. Optional
 *   and additive — `line-payload.ts`'s only caller doesn't pass it yet.
 *   `customNote` (the colour wish) is hashed HERE, via `hashNote`, and never
 *   accepted pre-hashed: one place decides how a wish becomes identity, so
 *   no caller can smuggle in a differently-derived hash. The segment is
 *   appended only when there is something to say (an inscription and/or a
 *   wish); otherwise the code is byte-identical to today's shape.
 */
export function encodeConfigCode(
  design: CodecDesign,
  selections: Record<string, string>,
  extras?: { customText?: string; customNote?: string }
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

  const parts = [CODE_PREFIX, design.code, ...segments];

  const noteHash = extras?.customNote ? hashNote(extras.customNote) : undefined;
  const textSegment = encodeTextSegment({ text: extras?.customText, noteHash });
  if (textSegment) parts.push(textSegment); // nothing to say → no segment at all

  return parts.join("-");
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

  // R5-TEXT-IDENTITY (task 2): the inscription segment is POSITIONAL, one
  // slot past the colour segments — `parts[cats.length]`. No sentinel char
  // is needed to find it: `encodeConfigCode` always emits exactly one
  // segment per category (defaults included), so for a GIVEN design this
  // index is stable. It's undefined on any code encoded before this task
  // shipped (the backward-compatibility contract), and on any code with
  // fewer segments than categories — both read as "no inscription".
  //
  // Fragility to flag for whoever touches the catalog next: if this design
  // ever gains a NEW category, `cats.length` grows by one, and an OLD code
  // (saved before that category existed) has its inscription segment sitting
  // exactly where the new category's segment is now expected. It gets read
  // as that category's option code, matches nothing, falls back to the
  // category default — and the inscription is silently lost. That's not a
  // new failure mode: it degrades, it never throws, same as a plain colour
  // segment shifting slots has always done in this positional grammar (ADR
  // 0011) — it just now costs a customer's words instead of a colour choice.
  const textSeg = parts[cats.length];
  const decodedText = textSeg !== undefined ? decodeTextSegment(textSeg) : null;
  const customText = decodedText?.text || undefined; // "" (nothing/garbage) → no field

  return {
    designSlug: design.slug,
    selections,
    ...(customText !== undefined ? { customText } : {}),
  };
  // any remaining extra segments (parts beyond cats.length + 1) are ignored
}
