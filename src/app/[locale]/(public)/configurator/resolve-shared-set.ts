import "server-only";

import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { getSupplierProducts } from "@/lib/catalog/products";
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
  if (entries.length === 0) return { lines, unavailable };

  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));

  const codecBySlug = new Map<string, CodecDesign>();
  for (const detail of details) {
    const codec = detail && toCodecDesign(detail);
    if (codec) codecBySlug.set(codec.slug, codec);
  }
  const findByCode = (code: string) =>
    [...codecBySlug.values()].find((d) => d.code === code.toUpperCase()) ?? null;

  // per-supplier product lists, fetched once each (already cached per-supplier)
  const productsBySupplier = new Map<
    string,
    ReturnType<typeof getSupplierProducts>
  >();
  const supplierProducts = (supplierId: string) => {
    let p = productsBySupplier.get(supplierId);
    if (!p) {
      p = getSupplierProducts(supplierId);
      productsBySupplier.set(supplierId, p);
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
      const products = await supplierProducts(design.supplierId);
      const product = products.find((p) => p.slug === entry.productSlug);
      if (!product) {
        // hidden or deleted ceramic → this row degrades, the set survives
        unavailable++;
        continue;
      }
      const { snapshot, configCode, designLayers } = buildConfigLinePayload(
        detail,
        design.name,
        decoded.selections
      );
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
      });
    } catch {
      // undecodable code (unknown design, garbage) → degrade the single row
      unavailable++;
    }
  }

  return { lines, unavailable };
}
