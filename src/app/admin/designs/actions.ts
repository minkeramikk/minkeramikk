"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/catalog/slug";
import { assignMissingCodes } from "@/lib/configurator/assign-codes";

export type DesignFormState = { error: string | null };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const designSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required"),
  descriptionNo: z.string().trim().optional().or(z.literal("")),
  descriptionEn: z.string().trim().optional().or(z.literal("")),
  supplierId: z.string().uuid("Pick a supplier"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean(),
});

export async function saveDesign(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const parsed = designSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    descriptionNo: formData.get("descriptionNo") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    supplierId: formData.get("supplierId") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const supabase = await createClient();

  // slug: permanent key — generate unique on create, keep on edit
  let slug: string;
  if (d.id) {
    const { data: cur } = await supabase
      .from("designs")
      .select("slug")
      .eq("id", d.id)
      .maybeSingle();
    if (!cur) return { error: "Design not found." };
    slug = cur.slug;
  } else {
    const { data: existing } = await supabase.from("designs").select("slug");
    slug = uniqueSlug(d.name, (existing ?? []).map((r) => r.slug));
  }

  // optional preview image
  let previewPath: string | undefined;
  const file = formData.get("previewImage");
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.includes(file.type)) {
      return { error: "Preview must be PNG, JPG or WebP." };
    }
    const path = `designs/${slug}/preview.png`;
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from("assets")
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) return { error: "Could not upload the preview image." };
    previewPath = path;
  }

  const row = {
    name: d.name,
    description_no: d.descriptionNo || null,
    description_en: d.descriptionEn || null,
    supplier_id: d.supplierId,
    sort_order: d.sortOrder,
    active: d.active,
    ...(previewPath ? { preview_image: previewPath } : {}),
  };

  let designId = d.id;
  if (d.id) {
    const { error } = await supabase.from("designs").update(row).eq("id", d.id);
    if (error) return { error: "Could not save the design." };
  } else {
    const { data, error } = await supabase
      .from("designs")
      .insert({ ...row, slug })
      .select("id")
      .single();
    if (error) return { error: "Could not create the design." };
    designId = data.id;
    // ADR 0011: assign the stable unique code now; never recalculated later.
    await assignMissingCodes(supabase);
  }

  revalidatePath("/admin/designs");
  if (!d.id) redirect(`/admin/designs/${designId}`);
  redirect("/admin/designs");
}

export async function deleteDesign(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid design." };

  const supabase = await createClient();
  // CASCADE removes its categories + options; orders keep their snapshots (no FK).
  const { error } = await supabase.from("designs").delete().eq("id", id.data);
  if (error) return { error: "Could not delete the design." };

  revalidatePath("/admin/designs");
  redirect("/admin/designs");
}

// ── nested categories ──

const LAYER_SLOTS = ["base", "mid", "detail", "extra", "top", "animal"] as const;

const categorySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  designId: z.string().uuid(),
  labelNo: z.string().trim().min(1, "Norwegian label is required"),
  labelEn: z.string().trim().min(1, "English label is required"),
  kind: z.enum(["color", "image"]),
  layerSlot: z.enum(LAYER_SLOTS),
  syncGroup: z.string().trim().optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export async function saveCategory(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const parsed = categorySchema.safeParse({
    id: formData.get("id") ?? "",
    designId: formData.get("designId") ?? "",
    labelNo: formData.get("labelNo") ?? "",
    labelEn: formData.get("labelEn") ?? "",
    kind: formData.get("kind") ?? "color",
    layerSlot: formData.get("layerSlot") ?? "base",
    syncGroup: formData.get("syncGroup") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const c = parsed.data;
  const supabase = await createClient();

  // slug from the EN label, unique within the design
  let slug: string;
  if (c.id) {
    const { data: cur } = await supabase
      .from("option_categories")
      .select("slug")
      .eq("id", c.id)
      .maybeSingle();
    if (!cur) return { error: "Category not found." };
    slug = cur.slug;
  } else {
    const { data: siblings } = await supabase
      .from("option_categories")
      .select("slug")
      .eq("design_id", c.designId);
    slug = uniqueSlug(c.labelEn, (siblings ?? []).map((r) => r.slug));
  }

  const row = {
    design_id: c.designId,
    slug,
    label_no: c.labelNo,
    label_en: c.labelEn,
    kind: c.kind,
    layer_slot: c.layerSlot,
    sync_group: c.syncGroup || null,
    sort_order: c.sortOrder,
  };

  const { error } = c.id
    ? await supabase.from("option_categories").update(row).eq("id", c.id)
    : await supabase.from("option_categories").insert(row);
  if (error) return { error: "Could not save the category." };

  revalidatePath(`/admin/designs/${c.designId}`);
  return { error: null };
}

export async function deleteCategory(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const designId = z.string().uuid().safeParse(formData.get("designId"));
  if (!id.success || !designId.success) return { error: "Invalid category." };

  const supabase = await createClient();
  // CASCADE removes the category's options too.
  const { error } = await supabase
    .from("option_categories")
    .delete()
    .eq("id", id.data);
  if (error) return { error: "Could not delete the category." };

  revalidatePath(`/admin/designs/${designId.data}`);
  return { error: null };
}
