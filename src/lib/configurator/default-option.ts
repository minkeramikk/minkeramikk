/**
 * The default option of a category: the one flagged `is_default`, otherwise the
 * first. Callers pass options ALREADY ordered by sort_order, so "first" means
 * first-by-sort_order — preserving pre-R2-1 behaviour when nothing is flagged.
 *
 * Single source of truth for the cover/preview default (R2-1a). Used by the
 * step-1 design-card cover (designs.ts), the design-detail layer
 * (design-options.ts → toCodecDesign), and the URL-less initial selection.
 */
export function pickDefaultOption<T extends { isDefault?: boolean }>(
  options: readonly T[]
): T | undefined {
  return options.find((o) => o.isDefault) ?? options[0];
}
