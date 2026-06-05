import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LayerSlot } from "@/lib/configurator/preview";

export interface CategoryOption {
  id: string;
  name: string;
  /** Display thumbnail (kind=image). */
  image: string | null;
  /** Swatch color (kind=color). */
  hex: string | null;
  /** Compositing asset for the preview (ADR 0010). */
  layerImage: string | null;
}

export interface DesignCategory {
  id: string;
  slug: string;
  labelNo: string | null;
  labelEn: string | null;
  kind: "image" | "color";
  layerSlot: LayerSlot;
  syncGroup: string | null;
  options: CategoryOption[];
}

export interface DesignDetail {
  id: string;
  slug: string;
  name: string;
  categories: DesignCategory[];
}

/**
 * Full step-2 data for a design: its categories (sorted) with active options
 * (sorted). Read with the anon client — RLS exposes only active rows.
 */
export async function getDesignDetail(
  slug: string
): Promise<DesignDetail | null> {
  const supabase = await createClient();

  const { data: design, error: designErr } = await supabase
    .from("designs")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (designErr) throw designErr;
  if (!design) return null;

  const { data: categories, error: catErr } = await supabase
    .from("option_categories")
    .select(
      "id, slug, label_no, label_en, kind, layer_slot, sync_group, sort_order, options(id, name, image, hex, layer_image, sort_order, active)"
    )
    .eq("design_id", design.id)
    .order("sort_order", { ascending: true });
  if (catErr) throw catErr;

  return {
    id: design.id,
    slug: design.slug,
    name: design.name,
    categories: (categories ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      labelNo: c.label_no,
      labelEn: c.label_en,
      kind: c.kind as "image" | "color",
      layerSlot: (c.layer_slot ?? "detail") as LayerSlot,
      syncGroup: c.sync_group,
      options: (c.options ?? [])
        .filter((o) => o.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({
          id: o.id,
          name: o.name,
          image: o.image,
          hex: o.hex,
          layerImage: o.layer_image,
        })),
    })),
  };
}
