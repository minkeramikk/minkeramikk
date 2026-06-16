import "server-only";

import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { getProductsBySlug } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import { decodeSetParam } from "@/lib/cart/set-code";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";

/** One recap row for the confirmation page — mini-plate layers, no prices. */
export interface SetPreviewLine {
  designName: string;
  productName: string;
  qty: number;
  /** Composited design layers (recolor = multiply) for <CartLineThumb>. */
  layers: { src: string; recolor: boolean }[];
  /** Chosen ceramic photo (F19 plate thumb), already a URL. */
  plateImage: string | null;
}

/**
 * Resolve a CA-3 `set=` param into recap lines with REAL composited mini-plates
 * (F30-B). Reads ONLY the public catalog (cached, like the configurator) — no
 * orders table, no persistence: the page stays stateless. Fully defensive: a
 * row whose design/product no longer resolves is dropped, never throws, so the
 * page degrades to the rows that survive (or nothing).
 */
export async function resolveSetPreviews(
  rawSet: string | undefined,
  locale: "no" | "en"
): Promise<SetPreviewLine[]> {
  if (!rawSet) return [];
  const { entries } = decodeSetParam(rawSet);
  if (entries.length === 0) return [];

  // catalog: all active designs (for code→design) + their details + products
  const [designs, products] = await Promise.all([
    getActiveDesigns(),
    getProductsBySlug(),
  ]);
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));
  const codecs: CodecDesign[] = [];
  const detailBySlug = new Map<string, NonNullable<(typeof details)[number]>>();
  for (const d of details) {
    if (!d) continue;
    detailBySlug.set(d.slug, d);
    const codec = toCodecDesign(d);
    if (codec) codecs.push(codec);
  }
  const findByCode = (code: string) =>
    codecs.find((c) => c.code === code.toUpperCase()) ?? null;

  const lines: SetPreviewLine[] = [];
  for (const entry of entries) {
    const product = products[entry.productSlug];
    if (!product) continue; // vanished product → drop this row

    let designName = "";
    let layers: SetPreviewLine["layers"] = [];
    try {
      const { designSlug, selections } = decodeConfigCode(
        entry.configCode,
        findByCode
      );
      const detail = detailBySlug.get(designSlug);
      if (detail) {
        designName = detail.name;
        const cats: SelectedCategory[] = detail.categories.map((c) => {
          const opt = c.options.find((o) => o.id === selections[c.slug]);
          return { layerSlot: c.layerSlot, layerImage: opt?.layerImage ?? null };
        });
        layers = getPreviewLayers(null, cats).map((l) => ({
          src: assetUrl(l.src),
          recolor: l.blend === "multiply",
        }));
      }
    } catch {
      /* unknown/garbled code → keep the row as a product thumb, no layers */
    }

    lines.push({
      designName,
      productName: locale === "no" ? product.nameNo : product.nameEn,
      qty: entry.qty,
      layers,
      plateImage: product.image ? assetUrl(product.image) : null,
    });
  }
  return lines;
}
