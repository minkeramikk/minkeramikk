"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadAsset } from "@/lib/catalog/upload-asset";
import { variantPath, variantWidth } from "@/lib/asset-variants";

export interface PhotoState {
  error: string | null;
  ok?: boolean;
}

const MAX_PHOTOS = 8;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadDesignPhoto(
  _prev: PhotoState,
  formData: FormData
): Promise<PhotoState> {
  const designId = String(formData.get("designId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const file = formData.get("image");
  if (!designId || !slug) return { error: "Missing design" };
  if (!(file instanceof File) || file.size === 0) return { error: "No file" };
  const ext = EXT[file.type];
  if (!ext) return { error: "Only PNG, JPG or WebP" };

  const supabase = await createClient();

  const { count } = await supabase
    .from("design_images")
    .select("id", { count: "exact", head: true })
    .eq("design_id", designId);
  if ((count ?? 0) >= MAX_PHOTOS) return { error: `Max ${MAX_PHOTOS} photos` };

  const uuid = crypto.randomUUID();
  const up = await uploadAsset(supabase, file, `design-photos/${slug}/${uuid}.${ext}`);
  if (up.error || !up.path) return { error: up.error ?? "Upload failed" };

  const { data: last } = await supabase
    .from("design_images")
    .select("sort_order")
    .eq("design_id", designId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("design_images")
    .insert({ design_id: designId, image: up.path, sort_order: nextOrder });
  if (error) return { error: error.message };

  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId}`);
  return { error: null, ok: true };
}

export async function reorderDesignPhoto(
  id: string,
  designId: string,
  dir: -1 | 1
): Promise<void> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("design_images")
    .select("id, sort_order")
    .eq("design_id", designId)
    .order("sort_order", { ascending: true });
  if (!rows) return;
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  await supabase.from("design_images").update({ sort_order: rows[j].sort_order }).eq("id", rows[i].id);
  await supabase.from("design_images").update({ sort_order: rows[i].sort_order }).eq("id", rows[j].id);
  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId}`);
}

export async function deleteDesignPhoto(id: string, designId: string): Promise<void> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("design_images")
    .select("image")
    .eq("id", id)
    .maybeSingle();
  if (row?.image) {
    const toRemove = [row.image];
    const w = variantWidth(row.image);
    const v = w ? variantPath(row.image, w) : null;
    if (v) toRemove.push(v);
    await supabase.storage.from("assets").remove(toRemove);
  }
  await supabase.from("design_images").delete().eq("id", id);
  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId}`);
}
