import "server-only";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveDesigns } from "./designs";
import { getDesignDetail } from "./design-options";
import {
  decodeConfigCode,
  toCodecDesign,
  ConfigCodeError,
} from "@/lib/configurator/config-code";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import { composePlate, type ComposeLayer } from "@/lib/orders/compose-plate";

/** Pre-composed featured thumb size (~512px, ADR 0016). */
export const FEATURED_THUMB_SIZE = 512;

/**
 * Resolve a config code to its ordered compositing layer PATHS (+ blend),
 * decoding against the ACTIVE catalog. Null when the code doesn't resolve.
 * Shared by the admin preview (client-side stack — admin only, never the
 * public home) and the thumb composer (downloads these paths).
 */
export async function resolveCodeLayers(
  configCode: string
): Promise<{ src: string; blend: "normal" | "multiply" }[] | null> {
  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));
  const codecs = details.flatMap((d) => {
    const c = d && toCodecDesign(d);
    return c ? [c] : [];
  });

  let designSlug: string;
  let selections: Record<string, string>;
  try {
    ({ designSlug, selections } = decodeConfigCode(
      configCode,
      (code) => codecs.find((c) => c.code === code.toUpperCase()) ?? null
    ));
  } catch (e) {
    if (e instanceof ConfigCodeError) return null;
    throw e;
  }

  const detail = details.find((d) => d?.slug === designSlug);
  if (!detail) return null;

  const cats: SelectedCategory[] = detail.categories.map((cat) => {
    const opt = cat.options.find((o) => o.id === selections[cat.slug]) ?? cat.options[0];
    return { layerSlot: cat.layerSlot, layerImage: opt?.layerImage ?? null };
  });
  return getPreviewLayers(null, cats);
}

/**
 * F28 (ADR 0016) — compose the SINGLE pre-rendered thumb for a featured
 * entry at save time (compose-plate reuse, F08): the home strip serves one
 * WebP per card, never stacked layers (lezione F26). For sets the caller
 * passes the FIRST row's code — the "Sett · N" badge says there's more.
 * Returns the WebP bytes, or null when the code/layers don't resolve.
 */
export async function composeFeaturedThumb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- storage-only use, Database generic irrelevant here
  supabase: SupabaseClient<any>,
  configCode: string
): Promise<Buffer | null> {
  const layers = await resolveCodeLayers(configCode);
  if (!layers || layers.length === 0) return null;

  const composeLayers: ComposeLayer[] = [];
  for (const l of layers) {
    const { data, error } = await supabase.storage.from("assets").download(l.src);
    if (error || !data) continue; // missing layer → degrade like the lab PDF
    composeLayers.push({
      bytes: Buffer.from(await data.arrayBuffer()),
      blend: l.blend,
    });
  }
  if (composeLayers.length === 0) return null;

  const png = await composePlate(composeLayers, FEATURED_THUMB_SIZE);
  if (!png) return null;
  return sharp(png).webp({ quality: 82 }).toBuffer();
}
