/**
 * Backfill real glaze-swatch images into options.image (F15 / ADR 0012).
 *
 * At import 1.5 the color options got `hex` + `layer_image` (the pre-colored
 * pattern PNG) but NO display swatch. F15 makes step 2 identical to the
 * original, where each color shows its real glaze-photo thumbnail. The source
 * is the legacy `palettes` collection (21 webp, one per color, keyed by hex,
 * full 1:1 coverage of the 21 distinct option colors — confirmed 2026-06-08).
 *
 * This backfill is idempotent and targeted (it does NOT re-scrape or re-wipe
 * options like the full import): it uploads one swatch per distinct hex to
 * `swatches/<hex>.png` (upsert) and sets options.image for every color option
 * whose hex matches. Re-runs converge to the same state.
 *
 * The CHECK on options was already relaxed to (image IS NOT NULL OR hex IS NOT
 * NULL) in migration 0005, so a color option may carry image+hex+layer_image
 * together — no new migration needed (ADR 0012).
 *
 * Run: npm run backfill:swatches
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* rely on process env */
  }
}

// Only url + hex are needed here; accept any superset (the full import's Item
// type carries extra fields like rawName/priceCents — structurally compatible).
type CatalogItem = { url: string; hex: string | null };
type Catalog = { collections: Record<string, CatalogItem[]> };

/** hex (lowercased "#rrggbb") → CDN url of its glaze swatch, from `palettes`. */
export function paletteSwatchByHex(catalog: Catalog): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of catalog.collections["palettes"] ?? []) {
    if (!p.hex) continue;
    const hex = p.hex.toLowerCase().replace(/^#+/, "#");
    if (!map.has(hex)) map.set(hex, p.url);
  }
  return map;
}

/** Storage path for a color's shared swatch (deduped by hex). */
export function swatchPath(hex: string): string {
  return `swatches/${hex.toLowerCase().replace(/^#+/, "")}.png`;
}

async function uploadSwatch(
  db: SupabaseClient,
  cdnUrl: string,
  path: string
): Promise<void> {
  const res = await fetch(`${cdnUrl}?format=750w`);
  if (!res.ok) throw new Error(`download ${cdnUrl}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/webp";
  const { error } = await db.storage
    .from("assets")
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

export type BackfillResult = {
  hexesWithSwatch: number;
  swatchesUploaded: number;
  optionsUpdated: number;
  colorOptionsTotal: number;
  missingSwatch: string[];
};

/**
 * Core, testable backfill. Uploads one swatch per distinct option hex that has
 * a palette match, then points options.image at it. Idempotent.
 */
export async function backfillSwatchImages(
  db: SupabaseClient,
  catalog: Catalog
): Promise<BackfillResult> {
  const byHex = paletteSwatchByHex(catalog);

  // distinct hexes among color options (hex NOT NULL)
  const { data: rows, error } = await db
    .from("options")
    .select("hex")
    .not("hex", "is", null);
  if (error) throw error;

  const colorOptionsTotal = rows?.length ?? 0;
  const distinct = new Set<string>();
  for (const r of rows ?? []) {
    if (r.hex) distinct.add((r.hex as string).toLowerCase());
  }

  const missingSwatch: string[] = [];
  let swatchesUploaded = 0;
  let optionsUpdated = 0;

  for (const hex of distinct) {
    const cdn = byHex.get(hex);
    if (!cdn) {
      missingSwatch.push(hex); // UI falls back to procedural grain / flat hex
      continue;
    }
    const path = swatchPath(hex);
    await uploadSwatch(db, cdn, path);
    swatchesUploaded++;

    const upd = await db
      .from("options")
      .update({ image: path })
      .eq("hex", hex)
      .select("id");
    if (upd.error) throw upd.error;
    optionsUpdated += upd.data?.length ?? 0;
  }

  return {
    hexesWithSwatch: swatchesUploaded,
    swatchesUploaded,
    optionsUpdated,
    colorOptionsTotal,
    missingSwatch,
  };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const catalog = JSON.parse(
    readFileSync(resolve(__dirname, "../src/lib/catalog.json"), "utf8")
  ) as Catalog;

  const r = await backfillSwatchImages(db, catalog);
  console.log("\n── swatch backfill (F15) ──");
  console.log(`  color options total:      ${r.colorOptionsTotal}`);
  console.log(`  distinct hexes w/ swatch: ${r.hexesWithSwatch}`);
  console.log(`  swatches uploaded:        ${r.swatchesUploaded}`);
  console.log(`  options.image set:        ${r.optionsUpdated}`);
  console.log(
    `  hexes WITHOUT swatch:     ${r.missingSwatch.length}` +
      (r.missingSwatch.length ? ` (${r.missingSwatch.join(", ")})` : "")
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
