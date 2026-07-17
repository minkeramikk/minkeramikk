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
  isDefault: boolean;
}

/**
 * One `options` row as read for step 2, with the palette join. Typed explicitly:
 * Supabase's inference struggles with the nested embed (same reason duplicateDesign
 * casts), so we shape it here and cast the query result to RawOptionRow[].
 */
export interface RawOptionRow {
  id: string;
  code: string | null;
  name: string | null;
  image: string | null;
  hex: string | null;
  layer_image: string | null;
  sort_order: number;
  active: boolean;
  is_default: boolean;
  supplier_colors: { name: string; hex: string; swatch_image: string | null } | null;
}

/**
 * F35 (ADR 0018): colour options resolve name/hex/image from the supplier_colors
 * join (palette-first); image options keep their own name/image. The output is the
 * UNCHANGED CategoryOption DTO, so the configurator is pixel-identical.
 */
export function mapOptionRow(o: RawOptionRow): CategoryOption {
  const pal = o.supplier_colors;
  return {
    id: o.id,
    code: o.code,
    name: pal ? pal.name : (o.name ?? ""),
    hex: pal ? pal.hex : o.hex,
    image: pal ? pal.swatch_image : o.image,
    layerImage: o.layer_image,
    isDefault: o.is_default,
  };
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
  nameNo: string;
  nameEn: string;
  /** R2-2a: shop opted this design into custom colour notes (step-2 block). */
  acceptsCustomNotes: boolean;
  descriptionNo: string | null;
  descriptionEn: string | null;
  images: string[]; // F36: gallery Storage paths, ordered by sort_order
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
    .select(
      "id, slug, code, name, name_no, name_en, accepts_custom_notes, description_no, description_en"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (designErr) throw designErr;
  if (!design) return null;

  const { data: imgRows } = await supabase
    .from("design_images")
    .select("image")
    .eq("design_id", design.id)
    .order("sort_order", { ascending: true });

  const { data: categories, error: catErr } = await supabase
    .from("option_categories")
    .select(
      "id, slug, label_no, label_en, kind, layer_slot, sync_group, sort_order, options(id, code, name, image, hex, layer_image, sort_order, active, is_default, supplier_colors(name, hex, swatch_image))"
    )
    .eq("design_id", design.id)
    .order("sort_order", { ascending: true });
  if (catErr) throw catErr;

  return {
    id: design.id,
    slug: design.slug,
    code: design.code,
    name: design.name,
    nameNo: design.name_no,
    nameEn: design.name_en,
    acceptsCustomNotes: design.accepts_custom_notes ?? false,
    descriptionNo: design.description_no,
    descriptionEn: design.description_en,
    images: (imgRows ?? []).map((r) => r.image),
    categories: (categories ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      labelNo: c.label_no,
      labelEn: c.label_en,
      kind: c.kind as "image" | "color",
      layerSlot: (c.layer_slot ?? "detail") as LayerSlot,
      syncGroup: c.sync_group,
      options: ((c.options ?? []) as unknown as RawOptionRow[])
        .filter((o) => o.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(mapOptionRow),
    })),
  };
}
