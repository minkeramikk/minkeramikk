import "server-only";

import { createClient } from "@/lib/supabase/server";

/** What step 1 of the configurator needs to render a design choice. */
export interface DesignSummary {
  id: string;
  slug: string;
  name: string;
  supplierId: string;
  /** Public supplier name (ADR 0009); null only if the supplier was deactivated. */
  supplierName: string | null;
  /** Storage path of the preview image (resolve with assetUrl). */
  previewImage: string | null;
}

/**
 * Active designs ordered by sort_order, read with the ANON client:
 * RLS hides inactive rows (AC1/AC4 of F01). Supplier names come from
 * the public_suppliers safe view (ADR 0009).
 */
export async function getActiveDesigns(): Promise<DesignSummary[]> {
  const supabase = await createClient();

  const [designsRes, suppliersRes] = await Promise.all([
    supabase
      .from("designs")
      .select("id, slug, name, supplier_id, preview_image")
      .order("sort_order", { ascending: true }),
    supabase.from("public_suppliers").select("id, name"),
  ]);

  if (designsRes.error) throw designsRes.error;
  if (suppliersRes.error) throw suppliersRes.error;

  const supplierNames = new Map(
    (suppliersRes.data ?? []).map((s) => [s.id as string, s.name as string])
  );

  return (designsRes.data ?? []).map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    supplierId: d.supplier_id,
    supplierName: supplierNames.get(d.supplier_id) ?? null,
    previewImage: d.preview_image,
  }));
}
