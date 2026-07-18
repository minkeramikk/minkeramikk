"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePriceToCents } from "@/lib/money/parse";
import { uniqueSlug } from "@/lib/catalog/slug";
import { piecesSchema } from "@/lib/catalog/pieces";
import { uploadAsset } from "@/lib/catalog/upload-asset";
import {
  parseTypedAttributesField,
  buildAttributeRpcRows,
} from "@/lib/catalog/product-attributes";

export type ProductFormState = { error: string | null };

const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  nameNo: z.string().trim().min(1, "Norwegian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
  descriptionNo: z.string().trim().max(2000, "Description (NO) is too long (max 2000 characters).").optional().or(z.literal("")),
  descriptionEn: z.string().trim().max(2000, "Description (EN) is too long (max 2000 characters).").optional().or(z.literal("")),
  supplierId: z.string().uuid("Pick a supplier"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  // F29: 1 = single item; >1 = set ("Sett · N deler"). Does not affect price.
  pieces: piecesSchema,
  visible: z.coerce.boolean(),
});


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
    pieces: formData.get("pieces") ?? 1,
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

  const attrs = parseTypedAttributesField(formData.get("attributes"));
  if (attrs === null) {
    return { error: "Check the product details: each row needs a valid value." };
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

  // optional image upload (the simple 1-image case; configurator assets = F10).
  // uploadAsset gives a token'd path (cache fix, Bug 1) + the F26 variant.
  const img = await uploadAsset(supabase, formData.get("image"), `products/${slug}.png`);
  if (img.error) return { error: img.error };
  const imagePath = img.path;

  const row = {
    name_no: p.nameNo,
    name_en: p.nameEn,
    description_no: p.descriptionNo || null,
    description_en: p.descriptionEn || null,
    price_cents: priceCents,
    supplier_id: p.supplierId,
    sort_order: p.sortOrder,
    pieces: p.pieces,
    visible: p.visible,
    ...(imagePath ? { image: imagePath } : {}),
  };

  let productId = p.id || "";
  if (p.id) {
    const { error } = await supabase.from("products").update(row).eq("id", p.id);
    if (error) return { error: "Could not save the product." };
  } else {
    const { data: created, error } = await supabase
      .from("products")
      .insert({ ...row, slug })
      .select("id")
      .single();
    if (error || !created) return { error: "Could not save the product." };
    productId = created.id;
  }

  // R2 A1: atomic replace via RPC (delete + insert in one transaction) — a
  // failed insert no longer leaves the product with no attributes.
  const { error: attrErr } = await supabase.rpc("replace_product_attributes", {
    p_product_id: productId,
    p_rows: buildAttributeRpcRows(attrs),
  });
  if (attrErr) return { error: "Could not save the product details." };

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

/**
 * Orders keep their own snapshots (`product_name_snapshot`, `price_cents_snapshot`,
 * …) and `order_items.product_id` is ON DELETE SET NULL, so deleting a ceramic
 * never destroys order history — it only detaches the link. What CAN block is
 * another table holding a RESTRICT reference (23503).
 */
function deleteFailureMessage(code: string | undefined): string {
  return code === "23503"
    ? "Still referenced elsewhere — hide it (Visible = No) instead of deleting."
    : "Could not delete.";
}

/** Inline row delete: returns the error instead of redirecting, so the list can show it. */
export async function deleteProductById(
  id: string
): Promise<{ error: string | null }> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: "Invalid product." };

  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", parsed.data);
  if (error) return { error: deleteFailureMessage(error.code) };

  revalidateTag("catalog");
  revalidatePath("/admin/products");
  return { error: null };
}

/**
 * Delete every ceramic of ONE supplier in a single statement — all or nothing,
 * so a blocked row can never leave the group half-emptied. Saves opening each
 * product just to delete it.
 */
export async function deleteAllProductsForSupplier(
  supplierId: string
): Promise<{ deleted: number; error: string | null }> {
  const parsed = z.string().uuid().safeParse(supplierId);
  if (!parsed.success) return { deleted: 0, error: "Invalid supplier." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("supplier_id", parsed.data)
    .select("id");
  if (error) return { deleted: 0, error: deleteFailureMessage(error.code) };

  revalidateTag("catalog");
  revalidatePath("/admin/products");
  return { deleted: data?.length ?? 0, error: null };
}

/**
 * F39 §3-bis — persist the whole order of ONE supplier's group, once, at the
 * end of the gesture (drag drop, or the tail of an arrow sequence).
 *
 * Replaces moveProduct, which fired one request per arrow click and renumbered
 * the entire catalogue with a serial UPDATE loop. The RPC (0026) does it in one
 * statement and refuses ids from another supplier, so a reorder can never move
 * a product across suppliers (AC-D3) nor leave the list half-numbered (AC-D4).
 */
export async function reorderProducts(
  supplierId: string,
  orderedIds: string[]
): Promise<{ error: string | null }> {
  const parsed = z
    .object({
      supplierId: z.string().uuid(),
      orderedIds: z.array(z.string().uuid()).min(1),
    })
    .safeParse({ supplierId, orderedIds });
  if (!parsed.success) return { error: "Invalid order." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_products", {
    p_supplier_id: parsed.data.supplierId,
    p_ids: parsed.data.orderedIds,
  });
  if (error) {
    // The RPC refuses anything that is not the exact group (22023,
    // invalid_parameter_value) — most often a page rendered before someone
    // added or cloned a product. Say so: "could not save" would send the admin
    // hunting for a fault that reloading fixes.
    if (error.code === "22023") {
      return { error: "This list is out of date — reload the page and try again." };
    }
    return { error: "Could not save the new order." };
  }

  // Only the tag: the public configurator's cached reads need it. NO
  // revalidatePath("/admin/products") — the client already holds the new order
  // optimistically, and an incoming RSC payload would snap the list back.
  revalidateTag("catalog");
  return { error: null };
}
