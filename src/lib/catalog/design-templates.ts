/**
 * Template seed data for new designs (F22).
 *
 * Palette colours: reference `swatches/<hex>.png` Storage paths from the F15
 * backfill — already in Storage, zero new uploads.
 *
 * Logo assets: the Squarespace CDN URLs from catalog.json are stored directly in
 * the `image` field. `assetUrl()` passes through absolute URLs, so they resolve
 * correctly in the UI.
 */
import catalog from "@/lib/catalog.json";

export type TemplateKey = "empty" | "colors-only" | "colors-and-logos";

type CatalogItem = { url: string; name: string; price: number | null; hex: string | null };
const cols = (catalog as { collections: Record<string, CatalogItem[]> }).collections;

export interface PaletteEntry {
  name: string;
  hex: string;
  /** Storage path `swatches/<hex-without-hash>.png` (F15 backfill). */
  image: string;
}

export interface LogoEntry {
  name: string;
  /** Squarespace CDN URL — stored directly in options.image. */
  image: string;
}

/** 21 shared palette swatches from catalog.json ("palettes" collection). */
export const PALETTE_COLORS: PaletteEntry[] = (cols["palettes"] ?? [])
  .filter((i): i is CatalogItem & { hex: string } => i.hex !== null)
  .map((i) => ({
    name: i.name,
    hex: i.hex,
    image: `swatches/${i.hex.replace(/^#/, "")}.png`,
  }));

/**
 * Animal-preview assets from catalog.json ("animals-preview" collection).
 * `name` is the core label (last token), consistent with the import script.
 */
export const LOGO_ASSETS: LogoEntry[] = (cols["animals-preview"] ?? []).map((item) => {
  const parts = item.name.split(/[-_\s]/).filter(Boolean);
  const name = parts[parts.length - 1] ?? item.name;
  return { name, image: item.url };
});

export interface TemplateInfo {
  title: string;
  description: string;
}

export const TEMPLATE_META: Record<TemplateKey, TemplateInfo> = {
  empty: {
    title: "Vuoto",
    description: "Design with no categories — build the structure from scratch.",
  },
  "colors-only": {
    title: "Solo colori",
    description: `Includes a "Colour" category pre-filled with ${PALETTE_COLORS.length} shared palette swatches.`,
  },
  "colors-and-logos": {
    title: "Colori + loghi",
    description: `Same as Solo colori, plus an "Animal" category with ${LOGO_ASSETS.length} shared logo assets.`,
  },
};
