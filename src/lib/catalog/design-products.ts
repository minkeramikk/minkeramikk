/**
 * F34 — pure resolution of the design→product whitelist (no React, no DB).
 *
 * Semantics (ADR 0017): a design with NO whitelist rows shows every visible
 * product of its supplier (retro-compatible, zero backfill); a design WITH rows
 * shows only those, intersected with the supplier's visible set (so a hidden or
 * deleted ceramic never leaks back in). Both call sites and the admin same-
 * supplier check go through here so the rule never drifts.
 */

/** Effective step-3 product set. `all` MUST already be the supplier's visible,
 *  sort_order-ordered list — the whitelist only narrows it. */
export function effectiveProducts<T extends { id: string }>(
  whitelist: string[],
  all: T[]
): T[] {
  if (whitelist.length === 0) return all;
  const keep = new Set(whitelist);
  return all.filter((p) => keep.has(p.id));
}

/** Ids among `picked` that belong to a different supplier than the design.
 *  Empty = every pick is valid (same-supplier invariant holds). */
export function productsWithForeignSupplier(
  designSupplierId: string,
  picked: { id: string; supplierId: string }[]
): string[] {
  return picked
    .filter((p) => p.supplierId !== designSupplierId)
    .map((p) => p.id);
}
