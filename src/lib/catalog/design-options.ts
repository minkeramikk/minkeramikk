import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { LayerSlot } from "@/lib/configurator/preview";

export interface CategoryOption {
  id: string;
  /** Stable config-code segment, unique per category (ADR 0011). */
  code: string | null;
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
  /** Stable design code, the <D> segment of the config code (ADR 0011). */
  code: string | null;
  name: string;
  categories: DesignCategory[];
}

/**
 * Full step-2 data for a design: its categories (sorted) with active options
 * (sorted). Read with the anon client — RLS exposes only active rows.
 */
/**
 * Cached per-slug under the `catalog` tag (PERF-1 / P-1). The keyParts carry the
 * slug so each design is its own cache entry; admin catalog writes invalidate the
 * whole `catalog` tag. Anon/RLS reads → safe to share process-wide.
 */
export async function getDesignDetail(
  slug: string
): Promise<DesignDetail | null> {
  return unstable_cache(() => loadDesignDetail(slug), ["design-detail", slug], {
    tags: ["catalog"],
  })();
}

async function loadDesignDetail(slug: string): Promise<DesignDetail | null> {
  const supabase = createPublicClient();

  const { data: design, error: designErr } = await supabase
    .from("designs")
    .select("id, slug, code, name")
    .eq("slug", slug)
    .maybeSingle();
  if (designErr) throw designErr;
  if (!design) return null;

  const { data: categories, error: catErr } = await supabase
    .from("option_categories")
    .select(
      "id, slug, label_no, label_en, kind, layer_slot, sync_group, sort_order, options(id, code, name, image, hex, layer_image, sort_order, active)"
    )
    .eq("design_id", design.id)
    .order("sort_order", { ascending: true });
  if (catErr) throw catErr;

  return {
    id: design.id,
    slug: design.slug,
    code: design.code,
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
          code: o.code,
          name: o.name,
          image: o.image,
          hex: o.hex,
          layerImage: o.layer_image,
        })),
    })),
  };
}
