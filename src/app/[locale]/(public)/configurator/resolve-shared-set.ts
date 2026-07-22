import "server-only";

import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { getDesignProducts } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { buildConfigLinePayload } from "@/lib/configurator/line-payload";
import { decodeSetParam } from "@/lib/cart/set-code";
import type { CartLine } from "@/lib/cart/cart";

/** A fully resolved shared-set row: a cart line minus its local identity. */
export type SharedSetLine = Omit<CartLine, "id">;

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
  if (entries.length === 0) return { lines, unavailable, context };

  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));

  const codecBySlug = new Map<string, CodecDesign>();
  for (const detail of details) {
    const codec = detail && toCodecDesign(detail);
    if (codec) codecBySlug.set(codec.slug, codec);
  }
  const findByCode = (code: string) =>
    [...codecBySlug.values()].find((d) => d.code === code.toUpperCase()) ?? null;

  // per-DESIGN product lists (F34: two designs of one supplier can differ),
  // each fetched once. Keyed by design id, resolved via the whitelist-aware read.
  const productsByDesign = new Map<
    string,
    ReturnType<typeof getDesignProducts>
  >();
  const designProducts = (designId: string, supplierId: string) => {
    let p = productsByDesign.get(designId);
    if (!p) {
      p = getDesignProducts(designId, supplierId);
      productsByDesign.set(designId, p);
    }
    return p;
  };

  for (const entry of entries) {
    try {
      const decoded = decodeConfigCode(entry.configCode, findByCode);
      const design = designs.find((d) => d.slug === decoded.designSlug);
      const detail = details.find((d) => d?.slug === decoded.designSlug);
      if (!design || !detail) {
        unavailable++;
        continue;
      }
      const products = await designProducts(design.id, design.supplierId);
      const product = products.find((p) => p.slug === entry.productSlug);
      if (!product) {
        // hidden, deleted, OR not in this design's whitelist → row degrades,
        // the set survives (existing defensive pattern, F34 AC5).
        unavailable++;
        continue;
      }
      const { snapshot, configCode, designLayers } = buildConfigLinePayload(
        detail,
        decoded.selections
      );
      // first row that fully resolves = the landing's current design
      context ??= { designSlug: design.slug, selections: decoded.selections };
      lines.push({
        productId: product.id,
        productNameNo: product.nameNo,
        productNameEn: product.nameEn,
        supplierId: design.supplierId,
        supplierName: design.supplierName ?? "",
        unitPriceCents: product.price.amountCents,
        currency: product.price.currency,
        quantity: entry.qty,
        configCode,
        configSnapshot: snapshot,
        layers: designLayers,
        plateImage: product.image ? assetUrl(product.image) : undefined,
        productSlug: product.slug,
        pieces: product.pieces,
      });
    } catch {
      // undecodable code (unknown design, garbage) → degrade the single row
      unavailable++;
    }
  }

  return { lines, unavailable, context };
}
