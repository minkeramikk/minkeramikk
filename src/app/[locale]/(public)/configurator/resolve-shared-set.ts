import "server-only";

import { decodeSetParam } from "@/lib/cart/set-code";
import {
  resolveCartEntries,
  type ResolvedLine,
} from "@/lib/cart/resolve-cart-entries";

/** A fully resolved shared-set row: a cart line minus its local identity. */
export type SharedSetLine = ResolvedLine;

export interface ResolvedSharedSet {
  lines: SharedSetLine[];
  /** Rows dropped by the parser + rows whose design/product no longer resolves. */
  unavailable: number;
  /**
   * Design (+ its option ids) of the FIRST resolved row. A `set=` landing has
   * no `?design=`, but a design IS there — this one — and the step-3 page has
   * to treat it as the current design or it falls back to a positional default
   * and shows another design's ceramics (bug 4, card R-EXTRA-step3-selection-e-
   * badge-drawer). A multi-design set keeps its first row as the context: the
   * grid can only scope to one design, and the rest of the set is in the cart
   * either way. `null` when nothing resolved.
   */
  context: { designSlug: string; selections: Record<string, string> } | null;
}

/**
 * CA-3 — resolve a `?set=` param into ready-to-add cart lines, server-side.
 *
 * Every read goes through the `catalog`-tagged data cache (designs, details,
 * per-supplier products), so a landing costs ~0 extra queries on cache hits.
 * The set can be MULTI-supplier (ADR 0007): products are resolved per design
 * supplier, not per the page's selected design.
 *
 * Prices are NEVER taken from the link — each line re-prices live from the
 * catalog product (ready for F20). Codes are re-encoded canonically via the
 * shared payload builder, so a shared line merges naturally with a manually
 * added identical configuration.
 *
 * Degradation, never failure: a row whose code doesn't decode or whose
 * product/design vanished only bumps `unavailable`; the rest survives.
 */
export async function resolveSharedSet(raw: string): Promise<ResolvedSharedSet> {
  const { entries, dropped } = decodeSetParam(raw);
  let unavailable = dropped;
  const lines: SharedSetLine[] = [];
  let context: ResolvedSharedSet["context"] = null;

  const results = await resolveCartEntries(entries);
  for (const result of results) {
    if (!result.ok) {
      unavailable++;
      continue;
    }
    // prima riga che risolve = design corrente della landing (bug 4, R-EXTRA)
    context ??= {
      designSlug: result.line.configSnapshot?.designSlug ?? "",
      selections: result.selections,
    };
    lines.push(result.line);
  }

  return { lines, unavailable, context };
}
