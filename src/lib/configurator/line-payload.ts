/**
 * Cart-line ingredients from a design configuration (F19 / CA-3). One builder
 * for BOTH producers of cart lines, so they stay byte-identical:
 *  - the step-3 page (manual add via ceramics-step)
 *  - the shared-set landing (CA-3), which reconstructs lines server-side
 *
 * Given a design detail + the selected option id per category, produce the
 * pieces a NewCartLine needs: the human-readable snapshot, the canonical
 * config code (ADR 0011 — re-encoded, never trusted from the URL), and the
 * composited design layers resolved to the SAME variant URLs the big preview
 * uses (F26.1) so the browser image cache hits.
 */
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { CartLayer, ConfigSnapshot } from "@/lib/cart/cart";
import { encodeConfigCode, toCodecDesign } from "./config-code";
import { pickDefaultOption } from "./default-option";
import { getPreviewLayers } from "./preview";
import { assetUrl } from "@/lib/storage";

export interface ConfigLinePayload {
  snapshot: ConfigSnapshot;
  configCode: string;
  /** Design pattern layers (no plate) for the cart-row mini preview (F19). */
  designLayers: CartLayer[];
}

/**
 * @param selById categorySlug → optionId; missing/unknown falls back to the
 *   category's cover default (is_default else first-by-sort_order) (same
 *   tolerance as the step-3 page always had).
 * @param customNote R2-2b — the customer's free-text colour note. Only stored
 *   on designs where `detail.acceptsCustomNotes` is true; trimmed automatically.
 *   Omit (or pass `""`) for default/studio-choice mode.
 */
export function buildConfigLinePayload(
  detail: DesignDetail,
  designName: string,
  selById: Record<string, string>,
  customNote?: string
): ConfigLinePayload {
  const pick = (c: DesignDetail["categories"][number]) =>
    c.options.find((o) => o.id === selById[c.slug]) ?? pickDefaultOption(c.options);

  const snapshot: ConfigSnapshot = {
    designSlug: detail.slug,
    designName,
    selections: detail.categories.map((c) => {
      const opt = pick(c);
      return {
        label: (c.labelNo ?? c.slug) as string,
        labelEn: c.labelEn ?? undefined,
        option: opt?.name ?? "",
        hex: opt?.hex ?? null,
      };
    }),
    // R2-2b: present (possibly "") only on designs that accept notes; the
    // server re-sanitises at order submit (zod). Off-feature designs omit it.
    ...(detail.acceptsCustomNotes ? { customNote: (customNote ?? "").trim() } : {}),
  };

  const normalized: Record<string, string> = {};
  for (const c of detail.categories) {
    const opt = pick(c);
    if (opt) normalized[c.slug] = opt.id;
  }
  const codec = toCodecDesign(detail);
  const configCode = codec
    ? encodeConfigCode(codec, normalized)
    : `MK-${detail.slug}`;

  const designLayers: CartLayer[] = getPreviewLayers(
    null,
    detail.categories.map((c) => {
      const opt = pick(c);
      return { layerSlot: c.layerSlot, layerImage: opt?.layerImage ?? null };
    })
  ).map((l) => ({
    src: assetUrl(l.src),
    recolor: l.blend === "multiply",
  }));

  return { snapshot, configCode, designLayers };
}
