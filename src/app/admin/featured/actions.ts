"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseFeaturedInput } from "@/lib/catalog/featured-input";
import { validateFeaturedPayload } from "@/lib/catalog/featured";
import {
  composeFeaturedThumb,
  resolveCodeLayers,
} from "@/lib/catalog/featured-thumb";
import { decodeSetParam } from "@/lib/cart/set-code";
import { assetUrl } from "@/lib/storage";
import { MAX_FEATURED } from "@/lib/catalog/featured-constants";

/** F28 — featured curation actions (ADR 0016). Pattern F09/F10: zod on every
 *  input, cookie client (RLS — service-role never here), revalidateTag. */

const INPUT_ERRORS: Record<string, string> = {
  empty: "Paste a config code or an app link.",
  "url-without-payload":
    "That link has no ?code= or ?set= in it — copy it from the configurator (Copy link / Share this set).",
  "invalid-set":
    "That set has rows that don't parse — re-copy the link from the app.",
  "invalid-code": "That doesn't look like a config code (MK-…) or an app link.",
};

export interface FeaturedPreview {
  kind: "design" | "set";
  payload: string;
  designName: string;
  setCount: number | null;
  /** the code the thumb is composed from (set: first row) */
  firstCode: string;
  /** admin-only stacked preview (never the public home): resolved layer URLs */
  layers: { src: string; multiply: boolean }[];
  /** set rows for the admin to verify WHAT goes in the shop window */
  rows: { code: string; productSlug: string; qty: number }[];
}

export type FeaturedFormState = {
  error: string | null;
  preview?: FeaturedPreview | null;
};

/** Parse + validate the pasted input; shared by Preview and Add. */
async function resolveInput(
  raw: string
): Promise<{ error: string } | { preview: FeaturedPreview }> {
  const parsed = parseFeaturedInput(raw);
  if (!parsed.ok) {
    return { error: INPUT_ERRORS[parsed.reason] ?? "Invalid input." };
  }
  // strict at ADD (ADR 0016): everything must resolve against the catalog
  const v = await validateFeaturedPayload(parsed.kind, parsed.payload);
  if (!v.ok) return { error: v.reason };

  const layers = (await resolveCodeLayers(v.firstCode)) ?? [];
  const rows =
    parsed.kind === "set"
      ? decodeSetParam(parsed.payload).entries.map((e) => ({
          code: e.configCode,
          productSlug: e.productSlug,
          qty: e.qty,
        }))
      : [];

  return {
    preview: {
      kind: parsed.kind,
      payload: parsed.payload,
      designName: v.designName,
      setCount: v.setCount,
      firstCode: v.firstCode,
      layers: layers.map((l) => ({
        src: assetUrl(l.src),
        multiply: l.blend === "multiply",
      })),
      rows,
    },
  };
}

/** Step 1 of the add flow: show WHAT would go in the shop window. */
export async function previewFeatured(
  _prev: FeaturedFormState,
  formData: FormData
): Promise<FeaturedFormState> {
  const raw = String(formData.get("input") ?? "");
  const r = await resolveInput(raw);
  return "error" in r ? { error: r.error, preview: null } : { error: null, preview: r.preview };
}

const labelSchema = z
  .string()
  .trim()
  .max(80, "Label too long (max 80 chars)")
  .optional()
  .or(z.literal(""));

/** Step 2: compose the thumb server-side and insert (gate: max 10). */
export async function addFeatured(
  _prev: FeaturedFormState,
  formData: FormData
): Promise<FeaturedFormState> {
  // Add comes from the preview block: the canonical payload travels in the
  // hidden confirmedInput (the visible input was reset by the preview action)
  const raw = String(
    formData.get("confirmedInput") || formData.get("input") || ""
  );
  const labels = z
    .object({ labelNo: labelSchema, labelEn: labelSchema })
    .safeParse({
      labelNo: formData.get("labelNo") ?? "",
      labelEn: formData.get("labelEn") ?? "",
    });
  if (!labels.success) {
    return { error: labels.error.issues[0]?.message ?? "Invalid label" };
  }

  const r = await resolveInput(raw);
  if ("error" in r) return { error: r.error };
  const { preview } = r;

  const supabase = await createClient();

  // gate max 10, app-side with a clear message (ADR 0016 — no trigger)
  const { count, error: countErr } = await supabase
    .from("featured_configs")
    .select("id", { count: "exact", head: true });
  if (countErr) return { error: "Could not check the featured count." };
  if ((count ?? 0) >= MAX_FEATURED) {
    return {
      error: `The shop window is full (${MAX_FEATURED}/${MAX_FEATURED}) — remove one first.`,
    };
  }

  // thumb FIRST (pre-composed, non-negotiable: the home serves ONE image per
  // card); if the insert fails afterwards we clean the upload up.
  const id = randomUUID();
  const thumbPath = `featured/${id}.webp`;
  const thumb = await composeFeaturedThumb(supabase, preview.firstCode);
  if (!thumb) {
    return { error: "Could not compose the preview image for this entry." };
  }
  const up = await supabase.storage
    .from("assets")
    .upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
  if (up.error) return { error: "Could not upload the preview image." };

  const { data: maxRow } = await supabase
    .from("featured_configs")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insErr } = await supabase.from("featured_configs").insert({
    id,
    kind: preview.kind,
    payload: preview.payload,
    label_no: labels.data.labelNo || null,
    label_en: labels.data.labelEn || null,
    thumb_image: thumbPath,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
  });
  if (insErr) {
    // don't leave an orphan thumb behind (lezione F22)
    await supabase.storage.from("assets").remove([thumbPath]);
    if (insErr.code === "23505") {
      return { error: "This configuration is already featured." };
    }
    return { error: "Could not save the featured entry." };
  }

  revalidateTag("featured");
  revalidatePath("/admin/featured");
  redirect("/admin/featured");
}

export async function removeFeatured(
  _prev: FeaturedFormState,
  formData: FormData
): Promise<FeaturedFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid entry." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("featured_configs")
    .select("thumb_image")
    .eq("id", id.data)
    .maybeSingle();
  if (!row) return { error: "Entry not found." };

  const { error } = await supabase
    .from("featured_configs")
    .delete()
    .eq("id", id.data);
  if (error) return { error: "Could not delete the entry." };

  // the thumb is owned by this row — remove it too (lezione F22)
  await supabase.storage.from("assets").remove([row.thumb_image]);

  revalidateTag("featured");
  revalidatePath("/admin/featured");
  redirect("/admin/featured");
}

/**
 * Move a row up/down (arrows ↑↓ — audit UX-6). The whole list is RENUMBERED
 * 1..n after the move, never value-swapped: with duplicate sort_order values
 * (rows seeded/cleaned outside the app) a swap of equal values was a silent
 * no-op — renumbering is idempotent and self-healing.
 */
export async function moveFeatured(
  // bound client-side (React does NOT forward the submitter's name/value to
  // plain form server actions — found the hard way)
  direction: "up" | "down",
  formData: FormData
): Promise<void> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("featured_configs")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true }); // stable tiebreak for dupes
  if (!rows) return;

  const idx = rows.findIndex((r) => r.id === id.data);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || target < 0 || target >= rows.length) return;

  const order = rows.map((r) => r.id);
  [order[idx], order[target]] = [order[target], order[idx]];

  for (let i = 0; i < order.length; i++) {
    const row = rows.find((r) => r.id === order[i])!;
    if (row.sort_order !== i + 1) {
      await supabase
        .from("featured_configs")
        .update({ sort_order: i + 1 })
        .eq("id", order[i]);
    }
  }

  revalidateTag("featured");
  revalidatePath("/admin/featured");
}

/** Inline label edit from the list row (optional, fallback stays). */
export async function updateFeaturedLabel(formData: FormData): Promise<void> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      labelNo: labelSchema,
      labelEn: labelSchema,
    })
    .safeParse({
      id: formData.get("id"),
      labelNo: formData.get("labelNo") ?? "",
      labelEn: formData.get("labelEn") ?? "",
    });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("featured_configs")
    .update({
      label_no: parsed.data.labelNo || null,
      label_en: parsed.data.labelEn || null,
    })
    .eq("id", parsed.data.id);

  revalidateTag("featured");
  revalidatePath("/admin/featured");
}
