"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadAsset } from "@/lib/catalog/upload-asset";
import {
  duplicatePaletteMessage,
  type ResolvedPaletteRow,
} from "@/lib/catalog/palette-rules";
import { assetUrl } from "@/lib/storage";

export type PaletteFormState = {
  error: string | null;
  ok?: boolean;
  /** On success: what was written per row, so the inline editor reconciles its
   *  state (new-row ids + token'd swatch paths) without a reload. */
  resolved?: ResolvedPaletteRow[];
};

/** One palette row from the editor. `key` is a stable client id used to find
 *  this row's swatch file field (`swatch-<key>`) regardless of reordering.
 *  `id` (uuid) is REQUIRED — the client mints it for new rows too, so the atomic
 *  replace reinserts the same id (options keep pointing at it) and the editor can
 *  reconcile by a known id after saving. */
const rowSchema = z.object({
  key: z.string().min(1),
  id: z.string().uuid(),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i, "Enter a valid hex, e.g. #1a2b3c."),
  name: z.string().trim().min(1, "Every colour needs a name."),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  swatchImage: z.string().nullable().default(null),
});

/** Storage extension from the uploaded file's MIME (don't store jpg/webp as .png). */
function extForType(type: string): string {
  return type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
}

export async function saveSupplierColors(
  _prev: PaletteFormState,
  formData: FormData
): Promise<PaletteFormState> {
  const supplierId = z.string().uuid().safeParse(formData.get("supplierId"));
  if (!supplierId.success) return { error: "Invalid supplier." };

  let rawRows: unknown;
  try {
    rawRows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "Invalid palette data." };
  }
  const parsed = z.array(rowSchema).safeParse(rawRows);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid palette row." };
  }
  const rows = parsed.data;

  const supabase = await createClient();

  // Upload any new swatch files (field swatch-<key>) to a token'd path (cache
  // fix). The `#` never reaches Storage: the folder uses the bare hex.
  const written: {
    id: string;
    hex: string;
    name: string;
    active: boolean;
    sort_order: number;
    swatch_image: string | null;
  }[] = [];
  for (const r of rows) {
    const hexNoHash = r.hex.replace(/^#/, "").toLowerCase();
    const file = formData.get(`swatch-${r.key}`);
    const ext = file instanceof File ? extForType(file.type) : "png";
    const up = await uploadAsset(
      supabase,
      file,
      `suppliers/${supplierId.data}/colors/${hexNoHash}.${ext}`
    );
    if (up.error) return { error: up.error };
    written.push({
      id: r.id,
      hex: r.hex.toLowerCase(),
      name: r.name,
      active: r.active,
      sort_order: r.sortOrder,
      swatch_image: up.path ?? r.swatchImage,
    });
  }

  const { error } = await supabase.rpc("replace_supplier_colors", {
    p_supplier_id: supplierId.data,
    p_rows: written,
  });
  if (error) {
    if (error.code === "23505") return { error: duplicatePaletteMessage(error.message) };
    if (error.code === "23503")
      return {
        error: "This colour is used by options — deactivate it instead of removing it.",
      };
    return { error: "Could not save the palette." };
  }

  // Public catalog cache only. No revalidatePath on this admin page: it's
  // force-dynamic, and an RSC refresh here would desync the controlled inputs
  // (same reason as saveDesignProducts).
  revalidateTag("catalog");

  // Report back what was written so the editor reconciles its client state
  // (ids of new rows + token'd swatch paths) — otherwise a second save without a
  // reload re-inserts new rows and loses the just-uploaded swatch.
  const resolved: ResolvedPaletteRow[] = rows.map((r, i) => ({
    key: r.key,
    id: written[i].id,
    swatchImage: written[i].swatch_image,
    swatchUrl: written[i].swatch_image ? assetUrl(written[i].swatch_image) : null,
  }));
  return { error: null, ok: true, resolved };
}
