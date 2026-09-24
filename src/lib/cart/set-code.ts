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
 *
 * R5-TEXT-IDENTITY (task 3, card §2 AC 3): a shared kit carries the COLOURS
 * of a line, never the customer's inscription/colour-wish (that segment is
 * identity for THIS customer's cart, not something to hand to whoever opens
 * the link). `encodeSetParam` strips it via `stripCustomSegment` below — no
 * catalog lookup needed, see that function's doc comment for why.
 */

import { CODE_PREFIX, normalizeConfigCode } from "@/lib/configurator/config-code";
import { decodeTextSegment } from "@/lib/configurator/text-segment";

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
 * Reads a `selections`-array length off ANY snapshot-shaped value, safely —
 * `ConfigSnapshot` (cart.ts), `OrderConfigSnapshot` (admin-orders.ts), and
 * the zod `.passthrough()` shape reaching `PaintedOrderItem.configSnapshot`
 * (email.ts) all carry a `selections` field, but only the first two are
 * statically typed as an array; the passthrough one is `unknown` by
 * construction. One safe reader, used by every call site, rather than each
 * one re-deriving its own cast. `undefined` when there's nothing usable
 * (no snapshot, no array) — the caller then can't strip safely.
 */
export function selectionCountOf(snapshot: unknown): number | undefined {
  const selections = (snapshot as { selections?: unknown } | null | undefined)
    ?.selections;
  return Array.isArray(selections) ? selections.length : undefined;
}

/**
 * The colours-only version of `code`, given how many colour segments it
 * has — NOT via a catalog lookup. `selectionCount` is
 * `configSnapshot.selections.length` for this exact line: `selections` is
 * built in `buildConfigLinePayload` as `detail.categories.map(...)` — one
 * entry per category, in the same walk `encodeConfigCode` uses to emit one
 * segment per category — so it travels WITH the line (client, server,
 * order item, everywhere) and needs no design resolver to read.
 *
 * A first version of this tried a catalog-free heuristic instead: decode
 * just the LAST dash-separated part with `decodeTextSegment` and drop it if
 * it "looks like" a text segment. Rejected — it isn't rare-edge-case wrong,
 * it's roughly-coin-flip wrong: a genuine 2-character colour option code
 * (normal once a category passes 31 options, see `assign-codes.ts`'s
 * `nextCode` fallback — and already the shape of several fixtures in this
 * very test file) has close to a 50% chance of LOOKING like a valid
 * non-empty text segment by pure alphabet-index coincidence, because
 * `decodeTextSegment`'s "flags" byte is just the option code's own first
 * character reinterpreted. There is no way to know where colour segments
 * end without knowing the design's category count — that's exactly why
 * `decodeConfigCode` (task 2) takes a design resolver in the first place.
 *
 * Belt and braces for a STALE count (a line saved before a category was
 * added to its design, so `selectionCount` is now one short of the real
 * `cats.length`): the part right past where colours are expected to end is
 * dropped ONLY when `decodeTextSegment` says it decodes to real content
 * (non-empty text and/or a wish hash). A `null`/empty result is treated as
 * "not confidently an inscription" and the code is left untouched —
 * keeping a stray inscription by mistake is a privacy annoyance; dropping
 * a real colour segment by mistake silently repaints someone's kit wrong,
 * which is worse.
 *
 * `decodeTextSegment` itself later grew a 2-char checksum (ADR 0011
 * amendment, final-review round 2) specifically because this exact
 * ambiguity showed up again, independently, in `config-code.ts`'s own
 * decode (a design LOSING a category, not gaining one) — measured at the
 * time as a ~25% false-positive rate for real 2-3 character option codes,
 * not the "coin flip" figure above (that number was for the ORIGINAL,
 * pre-checksum codec this file was rejecting a heuristic against). The
 * checksum lowers the residual risk here too, but this file's own
 * `selectionCount`-based approach stays the primary defence: a stale count
 * is still exactly the scenario where relying on chance ALONE — even much
 * better chance — is the wrong instinct.
 *
 * Exported: the card §3 "Save as palette" guard (`configurator-client.tsx`)
 * reuses this SAME function to compare a draft's colours against saved
 * palettes, ignoring any inscription — one strip implementation, not two
 * competing ideas of where the colours end.
 */
export function stripCustomSegment(code: string, selectionCount?: number): string {
  if (selectionCount === undefined) return code;
  const parts = normalizeConfigCode(code).split("-");
  const prefixLen = parts[0] === CODE_PREFIX ? 1 : 0;
  const expectedLen = prefixLen + 1 + selectionCount; // prefix? + design + N colour segments
  if (parts.length <= expectedLen) return code; // nothing past the colours to strip

  const decoded = decodeTextSegment(parts[expectedLen]);
  const hasContent = !!(decoded && (decoded.text || decoded.noteHash));
  if (!hasContent) return code; // not confidently an inscription — never guess

  return parts.slice(0, expectedLen).join("-");
}

/**
 * Encode cart lines into the `set=` param value. Lines without a usable
 * configCode or productSlug are skipped (legacy localStorage rows — the share
 * UI surfaces a "not shareable" notice with the skipped count) — the same
 * `.filter()` below also drops an unpainted line (R5-UNPAINTED: configCode is
 * `null`, falsy), since a link with no design to reopen isn't shareable either.
 *
 * `selectionCount` (R5-TEXT-IDENTITY task 3) lets the caller strip a line's
 * inscription/colour-wish segment before it enters the link — pass
 * `selectionCountOf(line.configSnapshot)`. Omitted → that line's code
 * travels exactly as given (today's behaviour), so a caller that genuinely
 * has no snapshot to read degrades safely instead of guessing.
 */
export function encodeSetParam(
  lines: {
    configCode: string | null;
    productSlug?: string;
    quantity: number;
    selectionCount?: number;
  }[]
): string {
  return lines
    .filter(
      (l) =>
        l.configCode &&
        CODE_RE.test(l.configCode) &&
        l.productSlug &&
        SLUG_RE.test(l.productSlug)
    )
    .map((l) => {
      // non-null: the filter above already required a truthy configCode
      const code = stripCustomSegment(l.configCode as string, l.selectionCount);
      return `${code}${SET_FIELD_SEP}${l.productSlug}${SET_FIELD_SEP}${clampQty(
        l.quantity
      )}`;
    })
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
