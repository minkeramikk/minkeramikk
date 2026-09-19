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
import { cleanCustomText } from "@/lib/orders/schema";

export interface ConfigLinePayload {
  snapshot: ConfigSnapshot;
  configCode: string;
  /** Design pattern layers (no plate) for the cart-row mini preview (F19). */
  designLayers: CartLayer[];
}

/**
 * R2-2b/F38 — the customer's OWN WORDS (colour note + inscription), merged
 * onto a snapshot under the design's own gates.
 *
 * Pulled out of `buildConfigLinePayload` (R5-BASKET-HOST final review,
 * finding 4b) because it has a SECOND caller now: step 2 publishes a
 * `currentConfig` for the header drawer, and the drawer's Paint hands that
 * snapshot straight to `paint()`. Step 2's own `draftPayload` is deliberately
 * note-free — it is the PALETTE draft, and a palette is a set of colours —
 * so without this merge Paint-from-the-drawer at step 2 produced a line with
 * no inscription, while the same Paint at step 3 kept it. Two producers, one
 * rule; the release has already shipped two bugs of exactly this shape.
 *
 * Neither field enters the config code or the `set=` link, so the merge can
 * never change which saved palette a configuration matches.
 *
 * @param customNote R2-2b — trimmed; only stored when the design accepts notes
 *   ("" means "studio's complementary colours", which is why it is kept).
 * @param customText F38 — untrusted URL input, so `cleanCustomText` re-sanitises
 *   and re-truncates here: this is the single choke point for that read path.
 *   Dropped entirely when empty (no "studio default" for text).
 */
export function withCustomFields(
  snapshot: ConfigSnapshot,
  detail: Pick<DesignDetail, "acceptsCustomNotes" | "acceptsCustomText">,
  customNote?: string,
  customText?: string
): ConfigSnapshot {
  const cleanedText = detail.acceptsCustomText ? cleanCustomText(customText ?? "") : "";
  // Cleared first: a gate that is OFF must leave nothing behind, or a
  // snapshot that once carried an inscription would keep it forever.
  const merged: ConfigSnapshot = { ...snapshot };
  delete merged.customNote;
  delete merged.customText;
  if (detail.acceptsCustomNotes) merged.customNote = (customNote ?? "").trim();
  if (cleanedText) merged.customText = cleanedText;
  return merged;
}

/**
 * @param selById categorySlug → optionId; missing/unknown falls back to the
 *   category's cover default (is_default else first-by-sort_order) (same
 *   tolerance as the step-3 page always had).
 * @param customNote R2-2b — the customer's free-text colour note. Only stored
 *   on designs where `detail.acceptsCustomNotes` is true; trimmed automatically.
 *   Omit (or pass `""`) for default/studio-choice mode.
 * @param customText F38 — the customer's inscription text, read from the
 *   untrusted `text=` URL param. Only stored on designs where
 *   `detail.acceptsCustomText` is true; this builder is the single
 *   sanitise choke point for that read path — re-sanitised + re-truncated
 *   via `cleanCustomText`, never just trimmed.
 */
export function buildConfigLinePayload(
  detail: DesignDetail,
  selById: Record<string, string>,
  customNote?: string,
  customText?: string
): ConfigLinePayload {
  const pick = (c: DesignDetail["categories"][number]) =>
    c.options.find((o) => o.id === selById[c.slug]) ?? pickDefaultOption(c.options);

  const snapshot = withCustomFields(
    {
      designSlug: detail.slug,
      designName: detail.name,
      designNameNo: detail.nameNo,
      designNameEn: detail.nameEn,
      selections: detail.categories.map((c) => {
        const opt = pick(c);
        return {
          label: (c.labelNo ?? c.slug) as string,
          labelEn: c.labelEn ?? undefined,
          option: opt?.name ?? "",
          hex: opt?.hex ?? null,
        };
      }),
    },
    detail,
    customNote,
    customText
  );

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
