import "server-only";

import { createClient } from "@/lib/supabase/server";
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
}

/**
 * Visible products of one supplier, ordered by sort_order. Read with the
 * anon client: RLS exposes only `visible=true` rows (F03 AC1), and the
 * supplier filter implements the design→supplier hook (ADR 0007).
 */
export async function getSupplierProducts(
  supplierId: string
): Promise<SupplierProduct[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name_no, name_en, price_cents, currency, image")
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
  }));
}
