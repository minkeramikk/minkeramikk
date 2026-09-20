/**
 * Shared-set URL codec (CA-3 "Share your set"). Pure, no React, no DB.
 *
 * A basket travels in the URL as `?set=<row>~<row>~…` where one row is
 *
 *   <configCode>.<productSlug>.<qty>
 *
 * `.` separates fields, `~` separates rows. Neither collides with the
 * config-code alphabet (ADR 0011: A–Z2–9 plus `-`) nor with product slugs
 * (slugify output: [a-z0-9-]) — guarded by an assertion test. Both chars are
 * URL-safe (`~` unreserved, `.` untouched by encodeURIComponent), so the
 * param stays readable.
 *
 * The link carries codes/slugs/quantities ONLY — never prices, never internal
 * ids: the landing re-prices live from the catalog (ready for F20).
 *
 * Decode is defensive and never throws: malformed rows are dropped (counted),
 * qty is clamped to 1–99, rows beyond the cap are dropped. A dropped row
 * degrades to a warning at the landing; the rest of the set survives.
 */

export interface SetEntry {
  configCode: string;
  productSlug: string;
  qty: number;
}

export const SET_FIELD_SEP = ".";
export const SET_ROW_SEP = "~";

/** Hard cap on rows in one link — beyond this, rows are dropped with a warning. */
export const SET_MAX_LINES = 50;

/**
 * Soft character budget for the FULL share URL (decision 5: silent check on
 * the share side; overflow is academic and only yields a "too big" message).
 */
export const SET_LINK_BUDGET = 1800;

export const SET_QTY_MIN = 1;
export const SET_QTY_MAX = 99;

/** What slugify produces (and the only slug shape we accept back). */
const SLUG_RE = /^[a-z0-9-]+$/;
/** Config code as normalized by the F04 codec: uppercase alnum + dashes. */
const CODE_RE = /^[A-Z0-9-]+$/;

export function clampQty(qty: number): number {
  return Math.min(SET_QTY_MAX, Math.max(SET_QTY_MIN, Math.trunc(qty)));
}

/**
 * Encode cart lines into the `set=` param value. Lines without a usable
 * configCode or productSlug are skipped (legacy localStorage rows — the share
 * UI surfaces a "not shareable" notice with the skipped count).
 */
export function encodeSetParam(
  lines: { configCode: string; productSlug?: string; quantity: number }[]
): string {
  return lines
    .filter(
      (l) =>
        l.configCode &&
        CODE_RE.test(l.configCode) &&
        l.productSlug &&
        SLUG_RE.test(l.productSlug)
    )
    .map(
      (l) =>
        `${l.configCode}${SET_FIELD_SEP}${l.productSlug}${SET_FIELD_SEP}${clampQty(
          l.quantity
        )}`
    )
    .join(SET_ROW_SEP);
}

/**
 * Decode a raw `set=` param. Never throws. Rows that are malformed (wrong
 * field count, bad code/slug shape, non-numeric qty) or beyond SET_MAX_LINES
 * are dropped and counted; qty is clamped to 1–99. Codes are only validated
 * in SHAPE here — the catalog lookup at the landing decides whether they
 * still resolve (a vanished design/product degrades that row, not the set).
 */
export function decodeSetParam(raw: string): {
  entries: SetEntry[];
  dropped: number;
} {
  const entries: SetEntry[] = [];
  let dropped = 0;
  if (!raw) return { entries, dropped };

  const rows = raw.split(SET_ROW_SEP).filter((r) => r.length > 0);
  for (const row of rows) {
    if (entries.length >= SET_MAX_LINES) {
      dropped++;
      continue;
    }
    const fields = row.split(SET_FIELD_SEP);
    if (fields.length !== 3) {
      dropped++;
      continue;
    }
    const [rawCode, slug, rawQty] = fields;
    const code = rawCode.toUpperCase();
    if (!CODE_RE.test(code) || !SLUG_RE.test(slug) || !/^\d{1,4}$/.test(rawQty)) {
      dropped++;
      continue;
    }
    entries.push({
      configCode: code,
      productSlug: slug,
      qty: clampQty(Number(rawQty)),
    });
  }
  return { entries, dropped };
}
