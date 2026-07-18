"use server";

import { z } from "zod";
import { revalidateTag, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildProductClone } from "@/lib/catalog/clone-product";

/** Per-row outcome — the panel renders one line per clone (card §2, AC2). */
export type CloneResult =
  | { ok: true; id: string; name: string }
  // `id` is present on a failure only when the row WAS created and a later step
  // failed: the report links straight to the draft it left behind, instead of
  // telling the admin to go hunt for it by name.
  | { ok: false; name: string; error: string; id?: string };

const args = z.object({
  sourceId: z.string().uuid(),
  targetSupplierId: z.string().uuid(),
});

/**
 * Clone ONE ceramic onto another supplier. One product per request, driven by
 * the client (card §2) — same shape as F35/F36, so a single failure reports
 * itself without taking the whole batch down.
 */
export async function cloneProductToSupplier(
  sourceId: string,
  targetSupplierId: string
): Promise<CloneResult> {
  const parsed = args.safeParse({ sourceId, targetSupplierId });
  if (!parsed.success) return { ok: false, name: "—", error: "Invalid request." };

  const supabase = await createClient();

  const { data: src } = await supabase
    .from("products")
    .select(
      "name_no, name_en, description_no, description_en, price_cents, currency, image, pieces"
    )
    .eq("id", parsed.data.sourceId)
    .maybeSingle();
  if (!src) return { ok: false, name: "—", error: "Ceramic not found." };

  // Same fetch-all + in-memory uniqueness check as duplicateDesign/saveProduct.
  const { data: allSlugs } = await supabase.from("products").select("slug");

  // Tail of the TARGET supplier's group (card: "sort_order dei cloni in coda
  // al gruppo del fornitore nuovo").
  const { data: last } = await supabase
    .from("products")
    .select("sort_order")
    .eq("supplier_id", parsed.data.targetSupplierId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = buildProductClone(
    src,
    parsed.data.targetSupplierId,
    (allSlugs ?? []).map((r) => r.slug),
    (last?.sort_order ?? 0) + 1
  );

  const { data: created, error: insErr } = await supabase
    .from("products")
    .insert(row)
    .select("id")
    .single();
  if (insErr || !created) {
    return { ok: false, name: src.name_no, error: "Could not create the copy." };
  }

  // Typed attributes (0017) — read the source rows, replace them on the clone.
  const { data: attrs } = await supabase
    .from("product_attributes")
    .select("key, label_no, label_en, value, value_num, sort_order")
    .eq("product_id", parsed.data.sourceId)
    .order("sort_order", { ascending: true });

  if (attrs && attrs.length > 0) {
    const { error: attrErr } = await supabase.rpc("replace_product_attributes", {
      p_product_id: created.id,
      p_rows: attrs,
    });
    if (attrErr) {
      return {
        ok: false,
        name: src.name_no,
        id: created.id,
        error: "Copied, but the details could not be copied — check the new ceramic.",
      };
    }
  }

  revalidateTag("catalog");
  revalidatePath("/admin/products");
  return { ok: true, id: created.id, name: src.name_no };
}
