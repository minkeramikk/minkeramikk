"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify, uniqueSlug } from "@/lib/catalog/slug";
import { assignMissingCodes } from "@/lib/configurator/assign-codes";
import { LOGO_ASSETS } from "@/lib/catalog/design-templates";
import {
  planAssetCopy,
  ownedAssetsToDelete,
  remapOwnedAsset,
} from "@/lib/catalog/design-assets";
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

/**
 * R3-VARIE §B — move a design's OWNED Storage assets to a new slug prefix and
 * rewrite the paths in the DB. The slug is the assets' ownership prefix
 * (`designs/<slug>/…`, `design-photos/<slug>/…`), so renaming it without moving
 * the objects breaks ownership silently (future duplicate/delete stop seeing
 * them).
 *
 * Order matters: copy everything FIRST (additive, reversible), then rewrite the
 * child paths, then the slug itself. If a single copy fails we delete what we
 * already copied and abort — the slug and every path stay as they were, never a
 * half-moved design. The old objects are removed only at the very end,
 * best-effort (a leftover is orphan storage, not a broken design).
 */
async function moveDesignAssets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  designId: string,
  fromSlug: string,
  toSlug: string
): Promise<string | null> {
  const { data: designRaw } = await supabase
    .from("designs")
    .select("preview_image, option_categories(options(id, image, layer_image))")
    .eq("id", designId)
    .maybeSingle();
  const design = designRaw as unknown as {
    preview_image: string | null;
    option_categories:
      | {
          options:
            | { id: string; image: string | null; layer_image: string | null }[]
            | null;
        }[]
      | null;
  } | null;
  if (!design) return "Design not found.";

  const { data: photos } = await supabase
    .from("design_images")
    .select("id, image")
    .eq("design_id", designId);

  const options = (design.option_categories ?? []).flatMap((c) => c.options ?? []);
  const oldPaths: (string | null)[] = [
    design.preview_image,
    ...options.flatMap((o) => [o.image, o.layer_image]),
    ...(photos ?? []).map((p) => p.image),
  ];

  // masters to copy: only what this design OWNS (shared swatches / CDN urls
  // are referenced as-is and must stay where they are).
  const copies = oldPaths
    .map((p) => planAssetCopy(p, fromSlug, toSlug))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const copied: string[] = [];
  const rollback = async () => {
    if (copied.length) await supabase.storage.from(ASSET_BUCKET).remove(copied);
  };

  for (const c of copies) {
    const { error } = await supabase.storage.from(ASSET_BUCKET).copy(c.from, c.to);
    // "already exists" at the destination is fine (a retry after a partial run).
    if (error && !/exist/i.test(error.message)) {
      await rollback();
      return `Could not move "${c.from}" — the slug was NOT changed.`;
    }
    copied.push(c.to);
    // F26 variants travel with their master; best-effort (a missing variant only
    // costs the onError fallback until the backfill regenerates it).
    const w = variantWidth(c.from);
    const vFrom = w ? variantPath(c.from, w) : null;
    const vTo = w ? variantPath(c.to, w) : null;
    if (vFrom && vTo) {
      const { error: vErr } = await supabase.storage
        .from(ASSET_BUCKET)
        .copy(vFrom, vTo);
      if (!vErr) copied.push(vTo);
    }
  }

  const remap = (p: string | null) => (p ? remapOwnedAsset(p, fromSlug, toSlug) : p);

  // rewrite the children first, the slug last: if a child update fails we abort
  // with the OLD slug still on the design, and the paths already rewritten point
  // at objects that exist (we just copied them) — nothing dangles either way.
  for (const o of options) {
    const image = remap(o.image);
    const layer = remap(o.layer_image);
    if (image === o.image && layer === o.layer_image) continue;
    const { error } = await supabase
      .from("options")
      .update({ image, layer_image: layer })
      .eq("id", o.id);
    if (error) {
      await rollback();
      return "Could not move the design images — the slug was NOT changed.";
    }
  }
  for (const ph of photos ?? []) {
    const image = remapOwnedAsset(ph.image, fromSlug, toSlug);
    if (image === ph.image) continue;
    const { error } = await supabase
      .from("design_images")
      .update({ image })
      .eq("id", ph.id);
    if (error) {
      await rollback();
      return "Could not move the design photos — the slug was NOT changed.";
    }
  }

  const { error: slugErr } = await supabase
    .from("designs")
    .update({ slug: toSlug, preview_image: remap(design.preview_image) })
    .eq("id", designId);
  if (slugErr) {
    await rollback();
    return "Could not change the slug.";
  }

  // best-effort cleanup of the old prefix (net: cleanup-orphan)
  const stale = ownedAssetsToDelete(oldPaths, fromSlug).flatMap((p) => {
    const w = variantWidth(p);
    const v = w ? variantPath(p, w) : null;
    return v ? [p, v] : [p];
  });
  if (stale.length) await supabase.storage.from(ASSET_BUCKET).remove(stale);

  return null;
}


const designSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  nameNo: z.string().trim().min(1, "Norwegian name is required"),
  nameEn: z.string().trim().min(1, "English name is required"),
  descriptionNo: z.string().trim().optional().or(z.literal("")),
  descriptionEn: z.string().trim().optional().or(z.literal("")),
  descriptionStep2No: z.string().trim().optional().or(z.literal("")),
  descriptionStep2En: z.string().trim().optional().or(z.literal("")),
  supplierId: z.string().uuid("Pick a supplier"),
  // R3-VARIE §B: the slug is editable on edit; empty = keep the current one.
  slug: z.string().trim().optional().or(z.literal("")),
  slugConfirmed: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean(),
  acceptsCustomNotes: z.coerce.boolean(),
  acceptsCustomText: z.coerce.boolean(),
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
    descriptionStep2No: formData.get("descriptionStep2No") ?? "",
    descriptionStep2En: formData.get("descriptionStep2En") ?? "",
    supplierId: formData.get("supplierId") ?? "",
    slug: formData.get("slug") ?? "",
    slugConfirmed:
      formData.get("slugConfirmed") === "on" ||
      formData.get("slugConfirmed") === "true",
    sortOrder: formData.get("sortOrder") ?? 0,
    active: formData.get("active") === "on" || formData.get("active") === "true",
    acceptsCustomNotes:
      formData.get("acceptsCustomNotes") === "on" ||
      formData.get("acceptsCustomNotes") === "true",
    acceptsCustomText:
      formData.get("acceptsCustomText") === "on" ||
      formData.get("acceptsCustomText") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const supabase = await createClient();

  // slug: generated on create; on edit it stays put unless it is explicitly
  // changed (R3-VARIE §B) — the change is validated, confirmed and moves the
  // design's Storage assets with it.
  let slug: string;
  let renameFrom: string | null = null;
  if (d.id) {
    const { data: cur } = await supabase
      .from("designs")
      .select("slug")
      .eq("id", d.id)
      .maybeSingle();
    if (!cur) return { error: "Design not found." };
    slug = cur.slug;
    const wanted = d.slug ?? "";
    if (wanted && wanted !== cur.slug) {
      if (slugify(wanted) !== wanted) {
        return {
          error: "Slug: lowercase letters, numbers and dashes only (e.g. amalfi-dyr).",
        };
      }
      const { data: clash } = await supabase
        .from("designs")
        .select("id")
        .eq("slug", wanted)
        .maybeSingle();
      if (clash) return { error: "That slug is already used by another design." };
      if (!d.slugConfirmed) return { error: "Confirm the slug change to continue." };
      renameFrom = cur.slug;
      slug = wanted;
    }
  } else {
    const { data: existing } = await supabase.from("designs").select("slug");
    slug = uniqueSlug(d.nameNo, (existing ?? []).map((r) => r.slug));
  }

  // Slug change: move the assets BEFORE anything else writes under the new
  // prefix. On failure nothing changed — we bail out with the design untouched.
  if (renameFrom && d.id) {
    const moveError = await moveDesignAssets(supabase, d.id, renameFrom, slug);
    if (moveError) return { error: moveError };
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
    description_step2_no: d.descriptionStep2No || null,
    description_step2_en: d.descriptionStep2En || null,
    supplier_id: d.supplierId,
    sort_order: d.sortOrder,
    active: d.active,
    accepts_custom_notes: d.acceptsCustomNotes,
    accepts_custom_text: d.acceptsCustomText,
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

  // TL amendment 2026-07-17: dedicated step-2 description (migration 0024).
  // Fetched separately so a pre-migration DB (column not there yet) only drops
  // this one field instead of failing the whole clone — the main select above
  // stays on the always-present columns.
  const step2 = await supabase
    .from("designs")
    .select("description_step2_no, description_step2_en")
    .eq("id", id.data)
    .maybeSingle();
  // 42703 = undefined_column: pre-migration DB, tolerate and drop just this field.
  // Any other error is real (transient/RLS) → surface it rather than silently
  // cloning without the step-2 text (this runs before the clone row is inserted).
  if (step2.error && step2.error.code !== "42703") {
    return { error: "Could not read the design." };
  }
  const step2Cols = step2.error
    ? {}
    : {
        description_step2_no: step2.data?.description_step2_no ?? null,
        description_step2_en: step2.data?.description_step2_en ?? null,
      };

  const { data: all } = await supabase.from("designs").select("slug");
  const fromSlug = src.slug;
  // R3-VARIE §B fix 1: the copy is named AT duplication (the form pre-fills
  // "<name> (copy)"), so its slug and asset folders are born right instead of
  // carrying a "-copy" URL forever. No name submitted → the old default.
  const nameNo = String(formData.get("nameNo") ?? "").trim() || `${src.name_no} (copy)`;
  const nameEn = String(formData.get("nameEn") ?? "").trim() || `${src.name_en} (copy)`;
  const name = nameNo;
  const toSlug = uniqueSlug(nameNo, (all ?? []).map((r) => r.slug));

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
      name_no: nameNo,
      name_en: nameEn,
      slug: toSlug,
      supplier_id: src.supplier_id,
      description_no: src.description_no,
      description_en: src.description_en,
      ...step2Cols,
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

  // F36: copy the cover-photo gallery into the clone's folder too.
  const { data: srcPhotos } = await supabase
    .from("design_images")
    .select("image, sort_order")
    .eq("design_id", id.data)
    .order("sort_order", { ascending: true });
  for (const ph of srcPhotos ?? []) {
    const copied = await resolveAsset(ph.image);
    await supabase.from("design_images").insert({
      design_id: design.id,
      image: copied ?? ph.image,
      sort_order: ph.sort_order,
    });
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
  // F36: free the cover-photo gallery too (rows themselves cascade via FK).
  const { data: photoRows } = await supabase
    .from("design_images")
    .select("image")
    .eq("design_id", id.data);
  paths.push(...(photoRows ?? []).map((r) => r.image));
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
