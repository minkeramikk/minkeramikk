import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { money, type Money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";

/** A ceramic the customer can pick at step 3 (ADR 0007: scoped to a supplier). */
export interface SupplierProduct {
  id: string;
  slug: string;
  nameNo: string;
  nameEn: string;
  /** Unit price as a Money value object (ADR 0005) — never a raw number. */
  price: Money;
  image: string | null;
  /** F29: pieces in the product. 1 = single item; >1 = set. */
  pieces: number;
}

/**
 * Visible products of one supplier, ordered by sort_order. Read with the
 * anon client: RLS exposes only `visible=true` rows (F03 AC1), and the
 * supplier filter implements the design→supplier hook (ADR 0007).
 * Cached per-supplier under the `catalog` tag (PERF-1 / P-1): anon + RLS
 * reads are identical for every viewer, and every admin product write
 * calls `revalidateTag("catalog")`.
 */
export async function getSupplierProducts(
  supplierId: string
): Promise<SupplierProduct[]> {
  return unstable_cache(
    () => loadSupplierProducts(supplierId),
    ["supplier-products", supplierId],
    { tags: ["catalog"] }
  )();
}

async function loadSupplierProducts(
  supplierId: string
): Promise<SupplierProduct[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name_no, name_en, price_cents, currency, image, pieces")
    .eq("supplier_id", supplierId)
    .eq("visible", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    nameNo: p.name_no,
    nameEn: p.name_en,
    price: money(p.price_cents, p.currency as Currency),
    image: p.image,
    pieces: p.pieces,
  }));
}

/** Minimal visible-product fields, keyed by slug (F30: resolve a shared set). */
export interface ProductCard {
  slug: string;
  nameNo: string;
  nameEn: string;
  image: string | null;
}

async function loadProductsBySlug(): Promise<Record<string, ProductCard>> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug, name_no, name_en, image")
    .eq("visible", true);
  if (error) throw error;
  const out: Record<string, ProductCard> = {};
  for (const p of data ?? []) {
    out[p.slug] = {
      slug: p.slug,
      nameNo: p.name_no,
      nameEn: p.name_en,
      image: p.image,
    };
  }
  return out;
}

/** All visible products keyed by slug, cached under the `catalog` tag. */
export const getProductsBySlug = unstable_cache(
  loadProductsBySlug,
  ["products-by-slug"],
  { tags: ["catalog"] }
);
