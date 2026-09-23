import "server-only";

import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { getDesignProducts } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import { PRODUCT_THUMB_WIDTH } from "@/lib/asset-variants";
import { decodeKitParam, encodeKitParam } from "@/lib/cart/kit-code";
import { toKitLines } from "@/lib/cart/kit-lines";
import { getFeaturedConfigs } from "@/lib/catalog/featured";
import type { SharedSetLine } from "./resolve-shared-set";

/**
 * R5-KIT — resolve a `?kit=` param into ready-to-add cart lines, server-side.
 *
 * A kit is vertical on ONE design (`<D>` head): rows whose product is not in
 * that design's whitelist degrade to `unavailable`. Every line is unpainted
 * (ADR 0027) with a live catalog price — colours are chosen at the landing.
 * Degradation, never failure: the rest of the kit survives.
 */
export interface ResolvedKit {
  lines: SharedSetLine[];
  /** parser drops + rows whose product no longer resolves */
  unavailable: number;
  design: { slug: string; name: string; nameNo: string; nameEn: string } | null;
  pieces: number;
  /** the kit's shop-window image, when a kit featured row carries this exact
   *  kit (matched on the canonical payload, same normalization as the ADD
   *  strict parse). Null: no match, the welcome keeps today's layout. */
  image: string | null;
  /** true when `image` is a custom upload (fills the welcome frame) */
  imageCustom: boolean;
}

export async function resolveKit(raw: string): Promise<ResolvedKit> {
  const none: ResolvedKit = { lines: [], unavailable: 0, design: null, pieces: 0, image: null, imageCustom: false };
  const { designCode, entries, dropped } = decodeKitParam(raw);
  if (entries.length === 0) return { ...none, unavailable: dropped };

  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));
  const detail = details.find((d) => d?.code === designCode.toUpperCase());
  if (!detail) return { ...none, unavailable: dropped + entries.length };
  const design = designs.find((d) => d.slug === detail.slug);
  if (!design) return { ...none, unavailable: dropped + entries.length };

  const products = await getDesignProducts(design.id, design.supplierId);
  const { lines, unavailable } = toKitLines(
    entries,
    { supplierId: design.supplierId, supplierName: design.supplierName },
    products.map((p) => ({
      id: p.id,
      slug: p.slug,
      nameNo: p.nameNo,
      nameEn: p.nameEn,
      priceCents: p.price.amountCents,
      currency: p.price.currency,
      image: p.image,
      pieces: p.pieces,
    })),
    (path) => assetUrl(path, { width: PRODUCT_THUMB_WIDTH })
  );
  const pieces = lines.reduce(
    (sum, l) => sum + l.quantity * (l.pieces ?? 1),
    0
  );
  // the welcome shows the kit's shop-window image when it has one: match this
  // exact kit on the canonical payload (same normalization the admin ADD
  // parses with — qty already clamped, rows already aggregated). Cached under
  // `featured`+`catalog`, ~0 queries on hit. Null when no featured row is
  // this kit (e.g. a hand-made share link).
  const canonical = encodeKitParam(
    designCode,
    entries.map((e) => ({ productSlug: e.productSlug, quantity: e.qty }))
  );
  const featured = canonical
    ? (await getFeaturedConfigs()).find(
        (f) => f.kind === "kit" && f.valid && f.payload === canonical
      )
    : undefined;
  return {
    lines,
    unavailable: dropped + unavailable,
    design: {
      slug: design.slug,
      name: design.name,
      nameNo: design.nameNo,
      nameEn: design.nameEn,
    },
    pieces,
    image: featured ? assetUrl(featured.thumbImage) : null,
    imageCustom: featured?.customImage ?? false,
  };
}
