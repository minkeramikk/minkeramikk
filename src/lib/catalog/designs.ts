import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { resilientRead } from "@/lib/supabase/resilient-read";
import {
  getPreviewLayers,
  type LayerSlot,
  type PreviewLayer,
} from "@/lib/configurator/preview";
import { pickDefaultOption } from "@/lib/configurator/default-option";

/** What step 1 of the configurator needs to render a design choice. */
export interface DesignSummary {
  id: string;
  slug: string;
  name: string;
  nameNo: string;
  nameEn: string;
  supplierId: string;
  /** Public supplier name (ADR 0009); null only if the supplier was deactivated. */
  supplierName: string | null;
  /** R3-B23: per-locale design description, shown in the step-1 contextual block. */
  descriptionNo: string | null;
  descriptionEn: string | null;
  /** Storage path of the preview image (resolve with assetUrl). */
  previewImage: string | null;
  /**
   * Default composed layers (AC7 F02): first active option per category,
   * ordered for compositing. Step 1 shows this instead of the bare asset.
   */
  defaultLayers: PreviewLayer[];
}

/**
 * Active designs ordered by sort_order. Inactive rows are excluded by an
 * explicit `active=true` filter (role-independent, F10) AND by RLS for anon
 * (AC1/AC4 of F01). Supplier names come from the public_suppliers view (ADR 0009).
 */
async function loadActiveDesigns(): Promise<DesignSummary[]> {
  // Both reads retry as one unit: they are the same cold connection, and a
  // half-read catalog is no use to anyone. The mapping below stays outside —
  // it is pure, so replaying it over a last-good row set is correct.
  const { designs, suppliers } = await resilientRead("active-designs", async () => {
    const supabase = createPublicClient();

    const [designsRes, suppliersRes] = await Promise.all([
      supabase
        .from("designs")
        .select(
          "id, slug, name, name_no, name_en, description_no, description_en, supplier_id, preview_image, sort_order, option_categories(layer_slot, sort_order, options(layer_image, sort_order, active, is_default))"
        )
        // Explicit active gate (F10): the configurator shows only published designs
        // for EVERY viewer — not just anon via RLS. A draft (active=false) created
        // in the back-office stays hidden until activated, even for a logged-in admin.
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("public_suppliers").select("id, name"),
    ]);

    if (designsRes.error) throw designsRes.error;
    if (suppliersRes.error) throw suppliersRes.error;

    return { designs: designsRes.data ?? [], suppliers: suppliersRes.data ?? [] };
  });

  const supplierNames = new Map(suppliers.map((s) => [s.id as string, s.name as string]));

  return designs.map((d) => {
    // default selection = first active option (by sort_order) of each category
    const selected = (d.option_categories ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => {
        // R2-1a: cover = the option flagged is_default, else first active by
        // sort_order. `pickDefaultOption` takes options already sorted by
        // sort_order, so map snake_case → isDefault and sort first.
        const active = (c.options ?? [])
          .filter((o) => o.active)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({ layerImage: o.layer_image, isDefault: o.is_default }));
        const chosen = pickDefaultOption(active);
        return {
          layerSlot: (c.layer_slot ?? "detail") as LayerSlot,
          layerImage: chosen?.layerImage ?? null,
        };
      });
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      nameNo: d.name_no,
      nameEn: d.name_en,
      supplierId: d.supplier_id,
      supplierName: supplierNames.get(d.supplier_id) ?? null,
      descriptionNo: d.description_no,
      descriptionEn: d.description_en,
      previewImage: d.preview_image,
      defaultLayers: getPreviewLayers(null, selected),
    };
  });
}

/**
 * Active designs, cached under the `catalog` tag (PERF-1 / P-1). Anon + RLS
 * reads are identical for every viewer, so a process-wide data cache is safe;
 * every admin write to the catalog calls `revalidateTag("catalog")`.
 */
export const getActiveDesigns = unstable_cache(loadActiveDesigns, ["active-designs"], {
  tags: ["catalog"],
});
