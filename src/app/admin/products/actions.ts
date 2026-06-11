"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePriceToCents } from "@/lib/money/parse";
import { uniqueSlug } from "@/lib/catalog/slug";
import { uploadVariant } from "@/lib/asset-variant-image";

export type ProductFormState = { error: string | null };

const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  nameNo: z.string().trim().min(1, "Norwegian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
  descriptionNo: z.string().trim().optional().or(z.literal("")),
  descriptionEn: z.string().trim().optional().or(z.literal("")),
  supplierId: z.string().uuid("Pick a supplier"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  visible: z.coerce.boolean(),
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function saveProduct(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const parsed = productSchema.safeParse({
    id: formData.get("id") ?? "",
    nameNo: formData.get("nameNo") ?? "",
    nameEn: formData.get("nameEn") ?? "",
    descriptionNo: formData.get("descriptionNo") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    supplierId: formData.get("supplierId") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
    visible: formData.get("visible") === "on" || formData.get("visible") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // price: kr → cents, never float (F09). Reject ambiguous input.
  const priceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  if (priceCents === null) {
    return { error: "Enter a valid price in kr (e.g. 1500 or 1500,50)." };
  }

  const p = parsed.data;
  const supabase = await createClient();

  // slug: keep the existing one on edit (permanent key); generate a unique one
  // on create.
  let slug: string;
  if (p.id) {
    const { data: current } = await supabase
      .from("products")
      .select("slug")
      .eq("id", p.id)
      .maybeSingle();
    if (!current) return { error: "Product not found." };
    slug = current.slug;
  } else {
    const { data: existing } = await supabase.from("products").select("slug");
    slug = uniqueSlug(p.nameNo, (existing ?? []).map((r) => r.slug));
  }

  // optional image upload (the simple 1-image case; configurator assets = F10)
  let imagePath: string | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.includes(file.type)) {
      return { error: "Image must be PNG, JPG or WebP." };
    }
    const path = `products/${slug}.png`;
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from("assets")
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) return { error: "Could not upload the image." };
    await uploadVariant(supabase, path, buf); // F26 resize-at-source (best-effort)
    imagePath = path;
  }

  const row = {
    name_no: p.nameNo,
    name_en: p.nameEn,
    description_no: p.descriptionNo || null,
    description_en: p.descriptionEn || null,
    price_cents: priceCents,
    supplier_id: p.supplierId,
    sort_order: p.sortOrder,
    visible: p.visible,
    ...(imagePath ? { image: imagePath } : {}),
  };

  const { error } = p.id
    ? await supabase.from("products").update(row).eq("id", p.id)
    : await supabase.from("products").insert({ ...row, slug });

  if (error) return { error: "Could not save the product." };

  revalidateTag("catalog");
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deleteProduct(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid product." };

  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id.data);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "This product is referenced by existing orders. Hide it (uncheck Visible) instead of deleting it.",
      };
    }
    return { error: "Could not delete the product." };
  }

  revalidateTag("catalog");
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

/** Quick show/hide toggle from the list row. */
export async function toggleProductVisible(formData: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const visible = formData.get("visible") === "true";
  if (!id.success) return;

  const supabase = await createClient();
  await supabase.from("products").update({ visible }).eq("id", id.data);
  revalidateTag("catalog");
  revalidatePath("/admin/products");
}
