/**
 * Compositing model for the live preview (F02, Passo 0).
 *
 * Ported from the legacy `getPreviewImagesForCode` (docs/legacy/compositing-map.md):
 * the preview is the plate photo (blend normal, bottom) with the design's layers
 * stacked on top. Color/pattern layers use `multiply`; the Amalfi animal SHAPE
 * (layer_slot "animal") sits on top with `normal` blend.
 *
 * Key legacy insight: `multiply` is commutative (A·B = B·A), so the order among
 * multiply layers is visually irrelevant. Only two things matter: the normal base
 * stays at the bottom and the normal shape stays on top. We still sort by a stable
 * slot rank for deterministic output (easier to test and to read in the DOM).
 *
 * Pure module: no DB, no React. Callers pass already-resolved selections.
 */

export type Blend = "normal" | "multiply";

export type LayerSlot =
  | "base"
  | "mid"
  | "detail"
  | "extra"
  | "top"
  | "animal";

/** A category of the chosen design plus the option currently selected in it. */
export interface SelectedCategory {
  layerSlot: LayerSlot;
  /** Storage path of the compositing asset (options.layer_image). */
  layerImage: string | null;
}

export interface PreviewLayer {
  /** Storage path (resolve to a URL with assetUrl). */
  src: string;
  blend: Blend;
}

// bottom → top. The animal shape is drawn last (over everything).
const SLOT_RANK: Record<LayerSlot, number> = {
  base: 0,
  mid: 1,
  detail: 2,
  extra: 3,
  top: 4,
  animal: 5,
};

// the animal shape is an opaque overlay; everything else tints via multiply.
function blendForSlot(slot: LayerSlot): Blend {
  return slot === "animal" ? "normal" : "multiply";
}

/**
 * Build the ordered preview layers.
 * @param plateImage optional plate photo path (step 3 choice); when absent the
 *   preview shows the design layers alone (step 2 has no ceramic selected yet).
 * @param categories the chosen design's categories with their current selection.
 */
export function getPreviewLayers(
  plateImage: string | null,
  categories: SelectedCategory[]
): PreviewLayer[] {
  const layers: PreviewLayer[] = [];

  if (plateImage) {
    layers.push({ src: plateImage, blend: "normal" });
  }

  const designLayers = categories
    .filter((c): c is SelectedCategory & { layerImage: string } =>
      Boolean(c.layerImage)
    )
    .slice()
    .sort((a, b) => SLOT_RANK[a.layerSlot] - SLOT_RANK[b.layerSlot])
    .map((c) => ({ src: c.layerImage, blend: blendForSlot(c.layerSlot) }));

  return layers.concat(designLayers);
}
