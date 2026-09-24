/**
 * Kit URL codec (R5-KIT task 1). Pure, no React, no DB.
 *
 * A kit travels in the URL as `?kit=<D>~<row>~…` where `<D>` is the design
 * code segment (`DesignDetail.code`) and one row is
 *
 *   <productSlug>.<qty>
 *
 * Same separators as `set=` (`.` fields, `~` rows — see set-code.ts), same
 * cap, same tolerance. Unlike `set=`, rows carry NO colours: every row
 * becomes an unpainted cart line at the landing (ADR 0027).
 *
 * Decode is defensive and never throws: malformed rows are dropped
 * (counted), qty is clamped to 1–99, rows beyond the cap are dropped.
 */

import {
  SET_FIELD_SEP,
  SET_MAX_LINES,
  SET_ROW_SEP,
  clampQty,
} from "./set-code";

export interface KitEntry {
  productSlug: string;
  qty: number;
}

export interface KitParam {
  designCode: string;
  entries: KitEntry[];
}

const SLUG_RE = /^[a-z0-9-]+$/;
const DESIGN_RE = /^[A-Z0-9]+$/;

/**
 * `<D>` segment of a config code: strips the MK- prefix, takes the first
 * segment. `null` when there is nothing usable.
 */
export function designSegmentOf(configCode: string): string | null {
  if (!configCode) return null;
  const parts = configCode.toUpperCase().split("-");
  const rest = parts[0] === "MK" ? parts.slice(1) : parts;
  const head = rest[0] ?? "";
  return DESIGN_RE.test(head) ? head : null;
}

/**
 * Lines → `<D>~slug.qty~…`. Aggregates qty per slug (colours are stripped,
 * so two painted lines of one product become one kit row); skips lines
 * without a valid slug. Empty string when nothing shareable.
 */
export function encodeKitParam(
  designCode: string,
  lines: { productSlug?: string; quantity: number }[]
): string {
  const code = designCode.toUpperCase();
  if (!DESIGN_RE.test(code)) return "";
  const bySlug = new Map<string, number>();
  for (const l of lines) {
    if (!l.productSlug || !SLUG_RE.test(l.productSlug)) continue;
    bySlug.set(
      l.productSlug,
      clampQty((bySlug.get(l.productSlug) ?? 0) + l.quantity)
    );
  }
  if (bySlug.size === 0) return "";
  const rows = [...bySlug.entries()]
    .slice(0, SET_MAX_LINES)
    .map(([slug, qty]) => `${slug}${SET_FIELD_SEP}${qty}`);
  return [code, ...rows].join(SET_ROW_SEP);
}

/**
 * Defensive decode, never throws: `{ designCode, entries, dropped }`.
 * A `.` in the first token means it is not a kit (it is a set row) →
 * `{ designCode: "", entries: [], dropped: 0 }`.
 */
export function decodeKitParam(raw: string): KitParam & { dropped: number } {
  const empty = { designCode: "", entries: [], dropped: 0 };
  if (!raw) return empty;
  const tokens = raw.split(SET_ROW_SEP).filter((t) => t.length > 0);
  if (tokens.length === 0) return empty;
  const [head, ...rows] = tokens;
  if (head.includes(SET_FIELD_SEP)) return empty;
  const designCode = head.toUpperCase();
  if (!DESIGN_RE.test(designCode)) return empty;
  const entries: KitEntry[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (entries.length >= SET_MAX_LINES) {
      dropped++;
      continue;
    }
    const fields = row.split(SET_FIELD_SEP);
    if (fields.length !== 2) {
      dropped++;
      continue;
    }
    const [slug, rawQty] = fields;
    if (!SLUG_RE.test(slug) || !/^\d{1,4}$/.test(rawQty)) {
      dropped++;
      continue;
    }
    entries.push({ productSlug: slug, qty: clampQty(Number(rawQty)) });
  }
  return { designCode, entries, dropped };
}
