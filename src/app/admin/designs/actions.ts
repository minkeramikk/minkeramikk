"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/catalog/slug";
import { assignMissingCodes } from "@/lib/configurator/assign-codes";
import { LOGO_ASSETS } from "@/lib/catalog/design-templates";
import { planAssetCopy, ownedAssetsToDelete } from "@/lib/catalog/design-assets";
import { productsWithForeignSupplier } from "@/lib/catalog/design-products";
import { uploadAsset } from "@/lib/catalog/upload-asset";
import { variantPath, variantWidth } from "@/lib/asset-variants";

const ASSET_BUCKET = "assets";

/** Append new designs at the END of the catalog (max sort_order + 1) so a fresh
 *  design never jumps ahead of the established default in the configurator. */
async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  const { data } = await supabase
    .from("designs")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? -1) + 1;
}

export type DesignFormState = { error: string | null; ok?: boolean };


const designSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  nameNo: z.string().trim().min(1, "Norwegian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
  descriptionNo: z.string().trim().optional().or(z.literal("")),
  descriptionEn: z.string().trim().optional().or(z.literal("")),
  supplierId: z.string().uuid("Pick a supplier"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean(),
  acceptsCustomNotes: z.coerce.boolean(),
});

export async function saveDesign(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const parsed = designSchema.safeParse({
    id: formData.get("id") ?? "",
    nameNo: formData.get("nameNo") ?? "",
    nameEn: formData.get("nameEn") ?? "",
    descriptionNo: formData.get("descriptionNo") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    supplierId: formData.get("supplierId") ?? "",
    sortOrder: formData.get("sortOrder") ?? 0,
    active: formData.get("active") === "on" || formData.get("active") === "true",
    acceptsCustomNotes:
      formData.get("acceptsCustomNotes") === "on" ||
      formData.get("acceptsCustomNotes") === "true",
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
    slug = uniqueSlug(d.nameNo, (existing ?? []).map((r) => r.slug));
  }

  // optional preview image — token'd path (cache fix, Bug 1) + F26 variant
  const preview = await uploadAsset(
    supabase,
    formData.get("previewImage"),
    `designs/${slug}/preview.png`
  );
  if (preview.error) return { error: preview.error };
  const previewPath = preview.path;

  const row = {
    name: d.nameNo,
    name_no: d.nameNo,
    name_en: d.nameEn,
    description_no: d.descriptionNo || null,
    description_en: d.descriptionEn || null,
    supplier_id: d.supplierId,
    sort_order: d.sortOrder,
    active: d.active,
    accepts_custom_notes: d.acceptsCustomNotes,
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

  revalidateTag("catalog");
  revalidatePath("/admin/designs");
  if (!d.id) redirect(`/admin/designs/${designId}`);
  redirect("/admin/designs");
}

// ── template wizard ─────────────────────────────────────────────────────────

const TEMPLATE_KEYS = ["empty", "colors-only", "colors-and-logos"] as const;

const templateSchema = z.object({
  template: z.enum(TEMPLATE_KEYS),
  name: z.string().trim().min(1, "Design name is required"),
  supplierId: z.string().uuid("Select a supplier"),
});

/**
 * F22: create a new design from a starting template.
 *
 * "Vuoto" → design only (active=false, no categories).
 * "Solo colori" → adds a "Hovedfarge / Colour" (color/base) category seeded with
 *   the selected supplier's active glaze palette — one option per supplier_colors
 *   row, pointing at it (name/hex/swatch resolve via the join, ADR 0018). A
 *   supplier with no palette gets a friendly message instead (no orphan design).
 * "Colori + loghi" → same as above plus an "Dyr / Animal" (image/animal)
 *   category seeded with animal assets (CDN URLs, zero new uploads).
 *
 * All designs are created as active=false (drafts). Codes are assigned via
 * the stable assignMissingCodes routine (ADR 0011).
 */
export async function createDesignFromTemplate(
  _prev: DesignFormState,
  formData: FormData,
): Promise<DesignFormState> {
  const parsed = templateSchema.safeParse({
    template: formData.get("template") ?? "empty",
    name: formData.get("name") ?? "",
    supplierId: formData.get("supplierId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { template, name, supplierId } = parsed.data;

  const supabase = await createClient();

  // Colour templates now seed from the supplier's own glaze palette (F35). Resolve
  // it BEFORE creating anything so a supplier with no palette gets a friendly
  // message instead of an orphan draft design + a trigger error.
  let palette: { id: string; sort_order: number }[] = [];
  if (template === "colors-only" || template === "colors-and-logos") {
    const { data: colours } = await supabase
      .from("supplier_colors")
      .select("id, sort_order")
      .eq("supplier_id", supplierId)
      .eq("active", true)
      .order("sort_order");
    if (!colours || colours.length === 0) {
      return {
        error: `Add glaze colours to this supplier first — /admin/suppliers/${supplierId}`,
      };
    }
    palette = colours;
  }

  // unique slug for this design
  const { data: existing } = await supabase.from("designs").select("slug");
  const slug = uniqueSlug(name, (existing ?? []).map((r) => r.slug));

  // create design (draft)
  const { data: design, error: dErr } = await supabase
    .from("designs")
    .insert({
      name,
      name_no: name,
      name_en: name,
      slug,
      supplier_id: supplierId,
      active: false,
      sort_order: await nextSortOrder(supabase),
    })
    .select("id")
    .single();
  if (dErr || !design) return { error: "Could not create the design." };
  const designId = design.id;

  // "Solo colori" + "Colori + loghi": seed Colour category
  if (template === "colors-only" || template === "colors-and-logos") {
    const { data: colorCat, error: ccErr } = await supabase
      .from("option_categories")
      .insert({
        design_id: designId,
        slug: "farge",
        label_no: "Hovedfarge",
        label_en: "Colour",
        kind: "color",
        layer_slot: "base",
        sort_order: 0,
      })
      .select("id")
      .single();
    if (ccErr || !colorCat) return { error: "Could not create the Colour category." };

    // Palette-linked options: name/hex/swatch come from supplier_colors via the
    // join (ADR 0018); the option only points at the colour + keeps its order.
    const { error: coErr } = await supabase.from("options").insert(
      palette.map((c) => ({
        category_id: colorCat.id,
        supplier_color_id: c.id,
        sort_order: c.sort_order,
        active: true,
      })),
    );
    if (coErr) return { error: "Could not seed palette options." };
  }

  // "Colori + loghi": additionally seed Animal category
  if (template === "colors-and-logos") {
    const { data: logoCat, error: lcErr } = await supabase
      .from("option_categories")
      .insert({
        design_id: designId,
        slug: "dyr",
        label_no: "Dyr",
        label_en: "Animal",
        kind: "image",
        layer_slot: "animal",
        sort_order: 1,
      })
      .select("id")
      .single();
    if (lcErr || !logoCat) return { error: "Could not create the Animal category." };

    const { error: loErr } = await supabase.from("options").insert(
      LOGO_ASSETS.map((l, i) => ({
        category_id: logoCat.id,
        name: l.name,
        image: l.image, // CDN URL — assetUrl() passes through absolute URLs
        sort_order: i,
        active: true,
      })),
    );
    if (loErr) return { error: "Could not seed animal options." };
  }

  // ADR 0011: assign stable codes now
  await assignMissingCodes(supabase);
  revalidateTag("catalog");
  revalidatePath("/admin/designs");
  redirect(`/admin/designs/${designId}`);
}

/**
 * Duplicate a design (categories + options + Storage assets) into a fresh draft.
 * Owned assets (`designs/<slug>/…`: bespoke layers, preview) are COPIED to the
 * clone's folder so it's fully independent; shared swatches and CDN thumbs are
 * referenced as-is. The copy is ready immediately (preview composes) — it lands
 * as a draft so you review + tick Active to publish.
 */
export async function duplicateDesign(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid design." };

  const supabase = await createClient();

  const { data: srcRaw } = await supabase
    .from("designs")
    .select(
      "name, name_no, name_en, slug, supplier_id, description_no, description_en, preview_image, " +
        "option_categories(slug, label_no, label_en, kind, layer_slot, sync_group, sort_order, " +
        "options(name, hex, image, layer_image, supplier_color_id, sort_order, active))"
    )
    .eq("id", id.data)
    .maybeSingle();
  // deep nested selects defeat supabase's type inference → cast to the shape.
  const src = srcRaw as unknown as {
    name: string;
    name_no: string;
    name_en: string;
    slug: string;
    supplier_id: string;
    description_no: string | null;
    description_en: string | null;
    preview_image: string | null;
    option_categories:
      | {
          slug: string;
          label_no: string | null;
          label_en: string | null;
          kind: "color" | "image";
          layer_slot: string | null;
          sync_group: string | null;
          sort_order: number | null;
          options:
            | {
                name: string | null;
                hex: string | null;
                image: string | null;
                layer_image: string | null;
                supplier_color_id: string | null;
                sort_order: number | null;
                active: boolean;
              }[]
            | null;
        }[]
      | null;
  } | null;
  if (!src) return { error: "Design not found." };

  const { data: all } = await supabase.from("designs").select("slug");
  const fromSlug = src.slug;
  const name = `${src.name} (copy)`;
  const toSlug = uniqueSlug(name, (all ?? []).map((r) => r.slug));

  // copy an owned asset to the clone's folder; fall back to referencing the
  // original if the source object is missing — never leave a dangling path.
  const resolveAsset = async (path: string | null): Promise<string | null> => {
    const copy = planAssetCopy(path, fromSlug, toSlug);
    if (!copy) return path ?? null;
    const { error } = await supabase.storage
      .from(ASSET_BUCKET)
      .copy(copy.from, copy.to);
    if (error && !/exist/i.test(error.message)) return path;
    // F26: bring the @<w>.webp variant along (best-effort — the onError
    // fallback covers the clone until the backfill regenerates it).
    const w = variantWidth(copy.from);
    const vFrom = w ? variantPath(copy.from, w) : null;
    const vTo = w ? variantPath(copy.to, w) : null;
    if (vFrom && vTo) await supabase.storage.from(ASSET_BUCKET).copy(vFrom, vTo);
    return copy.to;
  };

  const { data: design, error: dErr } = await supabase
    .from("designs")
    .insert({
      name,
      name_no: `${src.name_no} (copy)`,
      name_en: `${src.name_en} (copy)`,
      slug: toSlug,
      supplier_id: src.supplier_id,
      description_no: src.description_no,
      description_en: src.description_en,
      preview_image: await resolveAsset(src.preview_image),
      active: false,
      sort_order: await nextSortOrder(supabase),
    })
    .select("id")
    .single();
  if (dErr || !design) return { error: "Could not create the copy." };

  for (const cat of src.option_categories ?? []) {
    const { data: newCat, error: cErr } = await supabase
      .from("option_categories")
      .insert({
        design_id: design.id,
        slug: cat.slug,
        label_no: cat.label_no,
        label_en: cat.label_en,
        kind: cat.kind,
        layer_slot: cat.layer_slot,
        sync_group: cat.sync_group,
        sort_order: cat.sort_order ?? 0,
      })
      .select("id")
      .single();
    if (cErr || !newCat) return { error: "Could not copy a category." };

    const rows = await Promise.all(
      (cat.options ?? []).map(async (o) => ({
        category_id: newCat.id,
        // colour options carry name/hex/image = null (they resolve via the
        // palette join); supplier_color_id is what the kind=color trigger needs.
        name: o.name,
        hex: o.hex,
        image: await resolveAsset(o.image), // no-op for colour options (image null)
        layer_image: await resolveAsset(o.layer_image),
        supplier_color_id: o.supplier_color_id,
        sort_order: o.sort_order ?? 0,
        active: o.active,
      }))
    );
    if (rows.length) {
      const { error: oErr } = await supabase.from("options").insert(rows);
      if (oErr) return { error: "Could not copy options." };
    }
  }

  // F34: carry over the whitelist. Products are shared (same supplier, not
  // cloned) so the ids are valid as-is; the same-supplier trigger re-checks.
  const { data: srcWhitelist } = await supabase
    .from("design_products")
    .select("product_id")
    .eq("design_id", id.data);
  if (srcWhitelist && srcWhitelist.length > 0) {
    const { error: wErr } = await supabase.from("design_products").insert(
      srcWhitelist.map((r) => ({
        design_id: design.id,
        product_id: r.product_id,
      }))
    );
    if (wErr) return { error: "Could not copy the available ceramics." };
  }

  await assignMissingCodes(supabase); // fresh codes for the clone
  revalidateTag("catalog");
  revalidatePath("/admin/designs");
  redirect(`/admin/designs/${design.id}`);
}

export async function deleteDesign(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid design." };

  const supabase = await createClient();

  // collect the design's OWNED storage objects BEFORE the row (and its options,
  // via CASCADE) disappear, so we can free the Storage too.
  const { data: designRaw } = await supabase
    .from("designs")
    .select("slug, preview_image, option_categories(options(image, layer_image))")
    .eq("id", id.data)
    .maybeSingle();
  const design = designRaw as unknown as {
    slug: string;
    preview_image: string | null;
    option_categories:
      | { options: { image: string | null; layer_image: string | null }[] | null }[]
      | null;
  } | null;
  if (!design) return { error: "Design not found." };

  const paths: (string | null)[] = [design.preview_image];
  for (const c of design.option_categories ?? [])
    for (const o of c.options ?? []) paths.push(o.image, o.layer_image);
  // F26: remove each owned master together with its @<w>.webp variant
  const toRemove = ownedAssetsToDelete(paths, design.slug).flatMap((p) => {
    const w = variantWidth(p);
    const v = w ? variantPath(p, w) : null;
    return v ? [p, v] : [p];
  });

  // CASCADE removes its categories + options; orders keep their snapshots (no FK).
  const { error } = await supabase.from("designs").delete().eq("id", id.data);
  if (error) return { error: "Could not delete the design." };

  // free the design's own Storage objects (never the shared swatches/) — keeps
  // Supabase Storage from filling up with deleted designs' assets.
  if (toRemove.length) {
    await supabase.storage.from(ASSET_BUCKET).remove(toRemove);
  }

  revalidateTag("catalog");
  revalidatePath("/admin/designs");
  redirect("/admin/designs");
}

// ── F34: design→product whitelist (Available ceramics) ──────────────────────

const uuidArraySchema = z.array(z.string().uuid());

export async function saveDesignProducts(
  _prev: DesignFormState,
  formData: FormData
): Promise<DesignFormState> {
  const designId = z.string().uuid().safeParse(formData.get("designId"));
  const mode = z.enum(["all", "some"]).safeParse(formData.get("mode"));
  if (!designId.success || !mode.success) return { error: "Invalid input" };

  // "all" == no rows; parse the picked ids only when in "some" mode.
  let wantedIds: string[] = [];
  if (mode.data === "some") {
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("productIds") ?? "[]"));
    } catch {
      return { error: "Invalid selection." };
    }
    const ids = uuidArraySchema.safeParse(raw);
    if (!ids.success) return { error: "Invalid selection." };
    wantedIds = ids.data;
    if (wantedIds.length === 0) {
      return { error: "Select at least one ceramic — or switch back to 'All'." };
    }
  }

  const supabase = await createClient();

  // resolve the design's supplier
  const { data: design } = await supabase
    .from("designs")
    .select("supplier_id")
    .eq("id", designId.data)
    .maybeSingle();
  if (!design) return { error: "Design not found." };

  // same-supplier guard (defense in depth #1; the DB trigger is #2)
  if (wantedIds.length > 0) {
    const { data: picked, error: pErr } = await supabase
      .from("products")
      .select("id, supplier_id")
      .in("id", wantedIds);
    if (pErr) return { error: "Could not validate the selection." };
    const found = picked ?? [];
    if (found.length !== wantedIds.length) {
      return { error: "Some selected ceramics no longer exist." };
    }
    const foreign = productsWithForeignSupplier(
      design.supplier_id,
      found.map((p) => ({ id: p.id, supplierId: p.supplier_id }))
    );
    if (foreign.length > 0) {
      return { error: "Every selected ceramic must belong to this design's supplier." };
    }
  }

  // atomic replace (delete + insert in one transaction, migration 0021)
  const { error } = await supabase.rpc("replace_design_products", {
    p_design_id: designId.data,
    p_product_ids: wantedIds,
  });
  if (error) return { error: "Could not save the available ceramics." };

  // NB: no revalidatePath on this admin page — it's force-dynamic (never cached),
  // so a reload re-queries anyway, and the RSC refresh a revalidate triggers
  // desyncs the controlled checkboxes (React keeps checked=true while the DOM
  // resets to false) since this action stays on the page instead of redirecting.
  revalidateTag("catalog"); // public configurator catalog cache only
  return { error: null, ok: true };
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

  revalidateTag("catalog");
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

  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId.data}`);
  return { error: null };
}
