"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assignMissingCodes } from "@/lib/configurator/assign-codes";
import { uploadAsset } from "@/lib/catalog/upload-asset";

export type BulkLayerState = {
  error: string | null;
  ok?: boolean;
  created?: boolean;
  updated?: boolean;
};

const schema = z.object({
  categoryId: z.string().uuid(),
  supplierColorId: z.string().uuid(),
  designId: z.string().uuid(),
});

/**
 * F35 bulk import — ONE server action PER FILE (never multi-file). Uploads a
 * single layer to a token'd path and upserts the colour option for
 * (category, palette colour): existing → update ONLY layer_image (idempotent
 * re-drop); missing → insert with the palette colour's sort_order. Codes and
 * cache revalidation are NOT done here — finalizeBulk runs once at batch end.
 */
export async function bulkUpsertOptionLayer(
  _prev: BulkLayerState,
  formData: FormData
): Promise<BulkLayerState> {
  const parsed = schema.safeParse({
    categoryId: formData.get("categoryId"),
    supplierColorId: formData.get("supplierColorId"),
    designId: formData.get("designId"),
  });
  if (!parsed.success) return { error: "Invalid bulk upload request." };
  const { categoryId, supplierColorId, designId } = parsed.data;

  const supabase = await createClient();

  const { data: cat } = await supabase
    .from("option_categories")
    .select("slug, kind, design_id, designs(slug, supplier_id)")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return { error: "Category not found." };
  if (cat.kind !== "color") return { error: "Bulk layers only apply to colour categories." };
  if (cat.design_id !== designId) return { error: "Category does not belong to this design." };
  const design = cat.designs as { slug: string; supplier_id: string } | null;
  if (!design) return { error: "Design not found." };

  const { data: colour } = await supabase
    .from("supplier_colors")
    .select("hex, supplier_id, sort_order")
    .eq("id", supplierColorId)
    .maybeSingle();
  if (!colour) return { error: "That glaze colour no longer exists." };
  if (colour.supplier_id !== design.supplier_id)
    return { error: "That colour belongs to a different supplier." };

  // Upload to a token'd path. The `#` NEVER reaches Storage (bare hex basename).
  const layer = await uploadAsset(
    supabase,
    formData.get("file"),
    `designs/${design.slug}/${cat.slug}/${colour.hex.slice(1)}-layer.png`
  );
  if (layer.error) return { error: layer.error };
  if (!layer.path) return { error: "No file was provided." };

  // Idempotent: one option per (category, colour). Re-drop → update the layer only.
  const { data: existing } = await supabase
    .from("options")
    .select("id")
    .eq("category_id", categoryId)
    .eq("supplier_color_id", supplierColorId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("options")
      .update({ layer_image: layer.path })
      .eq("id", existing.id);
    if (error) return { error: "Could not update the layer." };
    return { error: null, ok: true, updated: true };
  }

  const { error } = await supabase.from("options").insert({
    category_id: categoryId,
    supplier_color_id: supplierColorId,
    sort_order: colour.sort_order,
    active: true,
    layer_image: layer.path,
  });
  if (error) return { error: "Could not create the option." };
  return { error: null, ok: true, created: true };
}

/** Run ONCE after a bulk batch: assign ADR-0011 codes to the new options and
 *  refresh the public catalog + this design's admin page. */
export async function finalizeBulk(designId: string): Promise<void> {
  const supabase = await createClient();
  await assignMissingCodes(supabase);
  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId}`);
}
