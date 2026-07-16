"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/catalog/slug";
import { assignMissingCodes } from "@/lib/configurator/assign-codes";
import {
  parseHex,
  optionShapeError,
  duplicateOptionMessage,
} from "@/lib/catalog/option-rules";
import { uploadAsset } from "@/lib/catalog/upload-asset";
import type { TablesInsert } from "@/lib/supabase/types";

export type OptionFormState = { error: string | null };

const optionSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  categoryId: z.string().uuid(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean(),
});

/** Map a Postgres write error from the options table to a friendly message.
 *  P0001 = the options_kind_shape trigger (ADR 0018); we pre-check with
 *  optionShapeError, so this is only hit on a UI bypass or cross-supplier race. */
function mapOptionWriteError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return duplicateOptionMessage(error.message);
  if (error.code === "P0001" || error.code === "23514")
    return "This option doesn't match its category (a colour needs a palette colour, an image needs an image).";
  return "Could not save the option.";
}

export async function saveOption(
  _prev: OptionFormState,
  formData: FormData
): Promise<OptionFormState> {
  const parsed = optionSchema.safeParse({
    id: formData.get("id") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const o = parsed.data;

  const supabase = await createClient();

  // category kind + slugs + the design's supplier (kind drives the two-way form)
  const { data: cat } = await supabase
    .from("option_categories")
    .select("slug, kind, designs(slug, supplier_id)")
    .eq("id", o.categoryId)
    .maybeSingle();
  if (!cat) return { error: "Category not found." };
  const kind = cat.kind as "color" | "image";
  const design = cat.designs as { slug: string; supplier_id: string } | null;
  const designSlug = design?.slug ?? "design";

  let row: TablesInsert<"options">;

  if (kind === "color") {
    // Colour option: reference a palette colour; no local name/hex/image.
    const parsedColour = z.string().uuid().safeParse(formData.get("supplierColorId"));
    const supplierColorId = parsedColour.success ? parsedColour.data : null;
    if (!supplierColorId)
      return { error: optionShapeError("color", { supplierColorId: null, hasImage: false }) };

    // same-supplier guard (the trigger is the DB-level net) + hex for the layer path
    const { data: colour } = await supabase
      .from("supplier_colors")
      .select("hex, supplier_id")
      .eq("id", supplierColorId)
      .maybeSingle();
    if (!colour) return { error: "That glaze colour no longer exists." };
    if (design && colour.supplier_id !== design.supplier_id)
      return { error: "That colour belongs to a different supplier." };

    const layer = await uploadAsset(
      supabase,
      formData.get("layerImage"),
      `designs/${designSlug}/${cat.slug}/${colour.hex.slice(1)}-layer.png`
    );
    if (layer.error) return { error: layer.error };

    row = {
      category_id: o.categoryId,
      supplier_color_id: supplierColorId,
      name: null,
      hex: null,
      image: null,
      sort_order: o.sortOrder,
      active: o.active,
      ...(layer.path ? { layer_image: layer.path } : {}),
    };
  } else {
    // Image option: keep its own name + image (+ optional hex), no palette link.
    const nameParsed = z.string().trim().min(1, "Name is required").safeParse(formData.get("name"));
    if (!nameParsed.success)
      return { error: nameParsed.error.issues[0]?.message ?? "Name is required" };
    const name = nameParsed.data;

    const hexParsed = parseHex(String(formData.get("hex") ?? ""));
    if (!hexParsed.ok) return { error: "Enter a valid hex colour, e.g. #1a2b3c." };

    const base = `designs/${designSlug}/${cat.slug}/${slugify(name) || "opt"}`;

    // current image (edit) so the image rule sees an existing asset
    let existingImage: string | null = null;
    if (o.id) {
      const { data: cur } = await supabase
        .from("options")
        .select("image")
        .eq("id", o.id)
        .maybeSingle();
      existingImage = cur?.image ?? null;
    }

    const img = await uploadAsset(supabase, formData.get("image"), `${base}.png`);
    if (img.error) return { error: img.error };
    const layer = await uploadAsset(supabase, formData.get("layerImage"), `${base}-layer.png`);
    if (layer.error) return { error: layer.error };

    const hasImage = Boolean(img.path || existingImage);
    const shapeErr = optionShapeError("image", { supplierColorId: null, hasImage });
    if (shapeErr) return { error: shapeErr };

    row = {
      category_id: o.categoryId,
      supplier_color_id: null,
      name,
      hex: hexParsed.hex,
      sort_order: o.sortOrder,
      active: o.active,
      ...(img.path ? { image: img.path } : {}),
      ...(layer.path ? { layer_image: layer.path } : {}),
    };
  }

  const res = o.id
    ? await supabase.from("options").update(row).eq("id", o.id)
    : await supabase.from("options").insert(row);
  if (res.error) return { error: mapOptionWriteError(res.error) };

  if (!o.id) await assignMissingCodes(supabase); // ADR 0011 stable code

  revalidateTag("catalog");
  const designId = String(formData.get("designId") ?? "");
  revalidatePath(`/admin/designs/${designId}/categories/${o.categoryId}`);
  revalidatePath(`/admin/designs/${designId}`);
  return { error: null };
}

export async function deleteOption(
  _prev: OptionFormState,
  formData: FormData
): Promise<OptionFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid option." };

  const supabase = await createClient();
  const { data: opt } = await supabase
    .from("options")
    .select("category_id")
    .eq("id", id.data)
    .maybeSingle();
  const { error } = await supabase.from("options").delete().eq("id", id.data);
  if (error) return { error: "Could not delete the option." };

  revalidateTag("catalog");
  const designId = String(formData.get("designId") ?? "");
  if (opt?.category_id)
    revalidatePath(`/admin/designs/${designId}/categories/${opt.category_id}`);
  revalidatePath(`/admin/designs/${designId}`);
  return { error: null };
}

const setDefaultSchema = z.object({
  optionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  designId: z.string().uuid(),
});

/**
 * R2-1a: mark one option as the category's cover default. Clears the previous
 * default first, then sets the chosen one. RLS authenticated (anon key client);
 * the partial-unique index `options_one_default_per_category` is the safety net
 * for a concurrent double-set (23505 → friendly message).
 */
export async function setDefaultOption(
  _prev: OptionFormState,
  formData: FormData
): Promise<OptionFormState> {
  const parsed = setDefaultSchema.safeParse({
    optionId: formData.get("optionId") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    designId: formData.get("designId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { optionId, categoryId, designId } = parsed.data;

  const supabase = await createClient();

  // Clear the current default in this category (no-op if optionId already is it).
  const clear = await supabase
    .from("options")
    .update({ is_default: false })
    .eq("category_id", categoryId)
    .neq("id", optionId);
  if (clear.error) return { error: "Could not update the default." };

  const set = await supabase
    .from("options")
    .update({ is_default: true })
    .eq("id", optionId)
    .eq("category_id", categoryId)
    .select("id");
  if (set.error) {
    if (set.error.code === "23505") {
      return { error: "Another default already exists for this category — retry." };
    }
    return { error: "Could not set the default." };
  }
  if (!set.data || set.data.length === 0) {
    return { error: "Could not set the default — option not found." };
  }

  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId}`);
  return { error: null };
}
