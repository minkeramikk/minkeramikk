"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/catalog/slug";
import { assignMissingCodes } from "@/lib/configurator/assign-codes";
import {
  parseHex,
  optionAssetError,
  duplicateOptionMessage,
} from "@/lib/catalog/option-rules";

export type OptionFormState = { error: string | null };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const optionSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean(),
});

async function uploadIf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: FormDataEntryValue | null,
  path: string
): Promise<{ path?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  if (!IMAGE_TYPES.includes(file.type)) return { error: "Images must be PNG, JPG or WebP." };
  const buf = Buffer.from(await file.arrayBuffer());
  const up = await supabase.storage
    .from("assets")
    .upload(path, buf, { contentType: file.type, upsert: true });
  if (up.error) return { error: "Could not upload the image." };
  return { path };
}

export async function saveOption(
  _prev: OptionFormState,
  formData: FormData
): Promise<OptionFormState> {
  const parsed = optionSchema.safeParse({
    id: formData.get("id") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    name: formData.get("name") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const o = parsed.data;

  const hexParsed = parseHex(String(formData.get("hex") ?? ""));
  if (!hexParsed.ok) return { error: "Enter a valid hex colour, e.g. #1a2b3c." };

  const supabase = await createClient();

  // path convention needs the design + category slugs
  const { data: cat } = await supabase
    .from("option_categories")
    .select("slug, designs(slug)")
    .eq("id", o.categoryId)
    .maybeSingle();
  if (!cat) return { error: "Category not found." };
  const designSlug = (cat.designs as { slug: string } | null)?.slug ?? "design";
  const base = `designs/${designSlug}/${cat.slug}/${slugify(o.name) || "opt"}`;

  // current image (edit) so the image-or-hex rule sees an existing asset
  let existingImage: string | null = null;
  if (o.id) {
    const { data: cur } = await supabase
      .from("options")
      .select("image")
      .eq("id", o.id)
      .maybeSingle();
    existingImage = cur?.image ?? null;
  }

  const img = await uploadIf(supabase, formData.get("image"), `${base}.png`);
  if (img.error) return { error: img.error };
  const layer = await uploadIf(supabase, formData.get("layerImage"), `${base}-layer.png`);
  if (layer.error) return { error: layer.error };

  const hasImage = Boolean(img.path || existingImage);
  const assetErr = optionAssetError(hexParsed.hex, hasImage);
  if (assetErr) return { error: assetErr };

  const row = {
    category_id: o.categoryId,
    name: o.name,
    hex: hexParsed.hex,
    sort_order: o.sortOrder,
    active: o.active,
    ...(img.path ? { image: img.path } : {}),
    ...(layer.path ? { layer_image: layer.path } : {}),
  };

  const res = o.id
    ? await supabase.from("options").update(row).eq("id", o.id)
    : await supabase.from("options").insert(row);

  if (res.error) {
    if (res.error.code === "23505") {
      return { error: duplicateOptionMessage(res.error.message) };
    }
    if (res.error.code === "23514") {
      // image-or-hex CHECK (defense in depth; we check above too)
      return { error: "Provide a hex colour or a swatch image (ADR 0012)." };
    }
    return { error: "Could not save the option." };
  }

  if (!o.id) await assignMissingCodes(supabase); // ADR 0011 stable code

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

  const designId = String(formData.get("designId") ?? "");
  if (opt?.category_id)
    revalidatePath(`/admin/designs/${designId}/categories/${opt.category_id}`);
  revalidatePath(`/admin/designs/${designId}`);
  return { error: null };
}
