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

/**
 * R5-PALETTE-PLACE — true while EVERY category's current selection is still
 * that category's own default (`pickDefaultOption`, same helper
 * `resolveSelections` seeds the initial selection with): "nothing chosen
 * yet" for the step-2 desktop `PaletteCard`, which withholds the synthetic
 * "Unsaved" draft chip and the Save invite until an actual choice diverges.
 * An empty `categories` array (no categories to choose from) is vacuously
 * "at default" — `.every()` on `[]` is `true`, and there is nothing to have
 * chosen differently.
 */
export function isAtDefaultSelection<
  T extends { slug: string; options: readonly { id: string; isDefault?: boolean }[] },
>(categories: readonly T[], selections: Record<string, string>): boolean {
  return categories.every(
    (cat) => selections[cat.slug] === (pickDefaultOption(cat.options)?.id ?? "")
  );
}
