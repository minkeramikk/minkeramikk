/**
 * R5-KIT — turn kit entries into ready-to-add cart lines. Pure, no DB.
 *
 * One row per entry: an UNPAINTED line (`configCode: null`,
 * `configSnapshot: null`, no `layers` — ADR 0027), live price from the
 * catalog product. Slugs the design whitelist no longer carries bump
 * `unavailable`; the rest survives.
 */
import type { SharedSetLine } from "@/app/[locale]/(public)/configurator/resolve-shared-set";
import type { KitEntry } from "./kit-code";

export interface KitProduct {
  id: string;
  slug: string;
  nameNo: string;
  nameEn: string;
  priceCents: number;
  currency: SharedSetLine["currency"];
  image?: string | null;
  pieces: number;
}

export function toKitLines(
  entries: KitEntry[],
  design: { supplierId: string; supplierName: string | null },
  products: KitProduct[],
  assetUrlOf: (path: string) => string
): { lines: SharedSetLine[]; unavailable: number } {
  const lines: SharedSetLine[] = [];
  let unavailable = 0;
  for (const entry of entries) {
    const product = products.find((p) => p.slug === entry.productSlug);
    if (!product) {
      unavailable++;
      continue;
    }
    lines.push({
      productId: product.id,
      productNameNo: product.nameNo,
      productNameEn: product.nameEn,
      supplierId: design.supplierId,
      supplierName: design.supplierName ?? "",
      unitPriceCents: product.priceCents,
      currency: product.currency,
      quantity: entry.qty,
      configCode: null,
      configSnapshot: null,
      plateImage: product.image ? assetUrlOf(product.image) : undefined,
      productSlug: product.slug,
      pieces: product.pieces,
    });
  }
  return { lines, unavailable };
}
