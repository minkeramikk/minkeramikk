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
import {
  allowedPositions,
  clampPosition,
  flagsForPosition,
  positionFromFlags,
  type TextPosition,
} from "./text-position";

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
  /**
   * R5-TEXT-POSITION: which of `top`/`bottom` this design offers (`centre`
   * and `back` are always implicit, DesignDetail's own default is `[]`).
   * Optional so the fixtures/designs that pre-date this task keep compiling
   * unchanged — `toCodecDesign` and decode both treat a missing value as `[]`.
   */
  textPositions?: readonly string[];
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
  /**
   * R5-TEXT-POSITION: where the inscription sits, valorized whenever
   * `customText` is (`centre` included — the position rides the same
   * segment as the text, so it's never "unknown", only "not applicable"
   * when there's no text at all). Clamped against `design.textPositions`
   * here, in decode, so a shared link asking for a position this design
   * doesn't offer degrades to `centre` instead of inventing an arc.
   */
  textPosition?: TextPosition;
}

export class ConfigCodeError extends Error {}

const sorted = (cats: CodecCategory[]) =>
  [...cats].sort((a, b) => a.slug.localeCompare(b.slug));

/**
 * Build a CodecDesign from the DB-shaped design detail. Shared by the UI
 * (encode current code) and decode (findDesignByCode over all designs).
 *
 * A category with zero options (R5-TEXT-POSITION: the retired «Tekst» group,
 * kept in the catalogue empty — GARANZIA §7) never becomes a segment: it has
 * no default option code to encode, `encodeConfigCode` was emitting `""` for
 * it, and `"...--..."` collapses to `"...-..."` on `normalizeConfigCode` —
 * one segment short of what every position-based reader (`decodeConfigCode`,
 * `stripCustomSegment` via `codecCategoryCount` below) expects, so everything
 * after it read as the wrong thing (fix 3: this is what made the palette
 * name change on every keystroke — `nameFor` hashed the un-stripped
 * inscription because the count was off by one). The filter belongs HERE,
 * not at each call site: encode, decode, and the category count all read
 * `CodecDesign.categories`, so filtering once keeps them agreeing by
 * construction — the alternative (each of the three re-deriving "real"
 * categories its own way) is exactly how they'd drift apart again.
 */
export function toCodecDesign(detail: {
  code: string | null;
  slug: string;
  categories: {
    slug: string;
    options: { id: string; code: string | null; isDefault?: boolean }[];
  }[];
  /** R5-TEXT-POSITION: absent (older callers) reads as `[]`, same as the DB default. */
  textPositions?: readonly string[];
}): CodecDesign | null {
  if (!detail.code) return null;
  return {
    code: detail.code,
    slug: detail.slug,
    textPositions: detail.textPositions ?? [],
    categories: detail.categories
      .filter((c) => c.options.length > 0)
      .map((c) => {
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
 * How many colour segments THIS design's code actually has — the count
 * every `stripCustomSegment(code, selectionCount)` caller with a live
 * `DesignDetail` (not just a frozen snapshot) must pass. `detail.categories
 * .length` counts a zero-option category (fix 3's «Tekst») that never
 * became a segment; this doesn't.
 */
export function codecCategoryCount(detail: {
  categories: { options: unknown[] }[];
}): number {
  return detail.categories.filter((c) => c.options.length > 0).length;
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
  extras?: { customText?: string; customNote?: string; textPosition?: TextPosition }
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
  // R5-TEXT-POSITION (0.1-3): the position rides bits 2-3 ONLY when there's
  // an inscription to attach it to — a colour wish with no text still gets
  // its own segment (the noteHash), but always at `centre`'s bits (0), never
  // a stray position from a caller that also happened to pass one. `.trim()`
  // here is a cheap pre-check, not the sanitiser: `encodeTextSegment` below
  // still runs the real `cleanCustomText` to decide `hasText` for itself;
  // this only decides whether position bits are worth setting at all.
  const hasCustomText = !!extras?.customText?.trim();
  const flags = hasCustomText ? flagsForPosition(extras?.textPosition ?? "centre") : 0;
  const textSegment = encodeTextSegment({ text: extras?.customText, noteHash, flags });
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
 * Tolerant (ADR 0011): missing segment → category default; unknown option
 * code → default; unknown design or malformed → throws ConfigCodeError
 * (callers show a gentle message, never crash). Segments past the colour
 * segments are inspected, not blindly "ignored": `parts[cats.length]` is
 * read as a CANDIDATE inscription segment (checksum-gated, see below and
 * ADR 0011's amendment) — accepted only when its checksum confirms it,
 * otherwise it degrades to ignored exactly as this ADR always said. Any
 * part beyond that single candidate slot is ignored outright, no exceptions.
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
  // Fragility to flag for whoever touches the catalog next, BOTH directions
  // (ADR 0011 amendment, round 2 of the final review — the first version of
  // this comment only covered one of them):
  //
  // - Design GAINS a category: `cats.length` grows by one, and an OLD code
  //   (saved before that category existed) has its inscription segment
  //   sitting exactly where the new category's segment is now expected. It
  //   gets read as that category's option code, matches nothing, falls back
  //   to the category default — the inscription is silently lost.
  // - Design LOSES a category: `cats.length` shrinks by one, and an OLD
  //   code's LAST COLOUR segment now sits in the inscription slot instead.
  //   Measured: an ordinary 1-2 character option code lands on
  //   `decodeTextSegment`'s checksum by pure coincidence for roughly 1 in
  //   961 tries at best (0/961 and 0/29791 measured directly for the option
  //   code lengths this catalog actually produces) — not the ~1-in-4 it was
  //   before the checksum existed. When it DOES pass, the "inscription"
  //   read off it is whatever that checksum-matching option code happens to
  //   decode to, not a real customer's words.
  //
  // Both directions degrade — a wrong-but-checksum-tolerant default colour,
  // or a lost/wrongly-recovered inscription — they never throw, same as a
  // plain colour segment shifting slots has always done in this positional
  // grammar (ADR 0011). The checksum makes the SECOND direction rare instead
  // of common; it does not (and structurally cannot) make either direction
  // impossible, because the grammar still has no sentinel marking the slot.
  const textSeg = parts[cats.length];
  const decodedText = textSeg !== undefined ? decodeTextSegment(textSeg) : null;
  const customText = decodedText?.text || undefined; // "" (nothing/garbage) → no field

  // R5-TEXT-POSITION: valorized whenever `customText` is, `centre` included
  // when the design offers it — never for a garbage/no-inscription decode.
  // Clamped against what THIS design actually offers (post-review revision:
  // none of the four positions is implicit any more): a `top` from a shared
  // link on a design that dropped `top`, or a `centre` on a design that
  // never offered it, drops silently to `undefined` rather than inventing
  // one — same tolerance the rest of this codec already has (ADR 0011).
  const textPosition =
    customText !== undefined
      ? clampPosition(positionFromFlags(decodedText?.flags ?? 0), allowedPositions(design.textPositions ?? []))
      : undefined;

  return {
    designSlug: design.slug,
    selections,
    ...(customText !== undefined ? { customText } : {}),
    ...(textPosition !== undefined ? { textPosition } : {}),
  };
  // any remaining extra segments (parts beyond cats.length + 1) are ignored
}
