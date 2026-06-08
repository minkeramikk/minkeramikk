/**
 * Import the live Squarespace catalog into Supabase (TODO 1.5).
 *
 * - Creates the "Vietri" supplier FIRST (designs/products FKs are NOT NULL, ADR 0007)
 * - Reads the ~20 hidden collections of the live site (gallery sections in the
 *   page HTML — the ?format=json mainContent is empty)
 * - Filename conventions (see docs/legacy/configurator-squarespace.html):
 *     products  "Name#1500.png"                  → price kr → cents (ADR 0005)
 *     palettes  "Palettes_#001c81_Blu Stampa"    → hex + display name
 *     layers    "Floreal01_..._#a3759f"          → hex (name via palette match)
 * - Color collections become options (kind=color, hex) of their category;
 *   image collections (animals, crabline, juletre) become kind=image options
 *   with the PNG uploaded to the assets bucket
 * - Idempotent: upsert by slug (designs/products/categories), wipe+insert for
 *   options (no natural key), storage upload with upsert
 *
 * Run: npm run import:squarespace
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assignMissingCodes } from "./backfill-codes";

// ───────────────────────── env ─────────────────────────

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
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// ─────────────────────── scraping ───────────────────────

const BASE = "https://www.minkeramikk.no";
const IMG_RE =
  /https:\/\/images\.squarespace-cdn\.com\/content\/v1\/[^"?\s\\]+\.(?:png|jpg|jpeg|webp)/g;

type Item = {
  url: string;
  rawName: string;
  priceCents: number | null;
  hex: string | null;
};

function parseFilename(fileUrl: string): Omit<Item, "url"> {
  const raw = decodeURIComponent(fileUrl.split("/").pop() ?? "");
  const base = raw.replace(/\.(png|jpe?g|webp)$/i, "").replace(/\+/g, " ");
  let rawName = base;
  let priceCents: number | null = null;
  let hex: string | null = null;

  const priceMatch = base.match(/#(\d{2,5})$/);
  const hexMatch = base.match(/#([0-9a-f]{6})/i);

  if (priceMatch) {
    priceCents = Number(priceMatch[1]) * 100;
    rawName = base.slice(0, priceMatch.index);
  } else if (hexMatch) {
    hex = `#${hexMatch[1].toLowerCase()}`;
    const after = base.slice((hexMatch.index ?? 0) + hexMatch[0].length);
    const before = base.slice(0, hexMatch.index);
    rawName = /[a-z]/i.test(after) ? after : before;
  }

  rawName = rawName
    .replace(/^[\s_#-]+|[\s_#-]+$/g, "")
    .replace(/---?|--/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s{2,}/g, " ")
    .normalize("NFC")
    .trim();
  return { rawName, priceCents, hex };
}

async function scrape(slug: string): Promise<Item[]> {
  const res = await fetch(`${BASE}/${slug}`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  const urls = [...new Set(html.match(IMG_RE) ?? [])].filter(
    (u) => !u.includes("minkeramikk") // logo
  );
  return urls.map((u) => ({ url: u, ...parseFilename(u) }));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "Animals-Fugl" → "Fugl" (legacy getCoreName behaviour) */
function coreName(rawName: string): string {
  const parts = rawName.split(/[-_\s]/).filter(Boolean);
  const last = parts[parts.length - 1] ?? rawName;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// ─────────────────── catalog structure ───────────────────
// Derived from the legacy configurator (docs/legacy/…): collections per
// design, kind per collection, layer_slot, sync_group (crab color lock only).

type CategorySpec = {
  slug: string;
  labelNo: string;
  labelEn: string;
  kind: "image" | "color";
  layerSlot: "base" | "mid" | "top" | "extra" | "detail" | "animal";
  syncGroup: string | null;
  collection: string;
  /**
   * ADR 0010: separate collection for the compositing layer when it differs
   * from the display collection. Only Amalfi: display = animals-preview thumb,
   * compositing = /animals- shape (matched by core name). For every other
   * category the compositing asset is the option's own PNG.
   */
  layerCollection?: string;
};

type DesignSpec = {
  slug: string;
  name: string;
  descriptionNo: string;
  descriptionEn: string;
  previewCollection: string;
  sortOrder: number;
  categories: CategorySpec[];
};

const DESIGNS: DesignSpec[] = [
  {
    slug: "blomster-1",
    name: "Blomster 1",
    descriptionNo: "Klassisk blomstermønster", // TODO:nb-review
    descriptionEn: "Classic flower pattern",
    previewCollection: "floreal1-detaljer",
    sortOrder: 1,
    categories: [
      { slug: "details", labelNo: "Detaljer", labelEn: "Details", kind: "color", layerSlot: "detail", syncGroup: null, collection: "floreal1-detaljer" },
      { slug: "borders", labelNo: "Kanter", labelEn: "Borders", kind: "color", layerSlot: "top", syncGroup: null, collection: "floreal1-kanter" },
    ],
  },
  {
    slug: "blomster-2",
    name: "Blomster 2",
    descriptionNo: "Blomster med blader", // TODO:nb-review
    descriptionEn: "Flowers with leaves",
    previewCollection: "floreal2-blader",
    sortOrder: 2,
    categories: [
      { slug: "leaves", labelNo: "Blader", labelEn: "Leaves", kind: "color", layerSlot: "mid", syncGroup: null, collection: "floreal2-blader" },
      { slug: "borders", labelNo: "Kanter", labelEn: "Borders", kind: "color", layerSlot: "top", syncGroup: null, collection: "floreal2-kanter" },
    ],
  },
  {
    slug: "amalfi-dyr",
    name: "Amalfi Dyr",
    descriptionNo: "Dyremotiver i Amalfi-stil", // TODO:nb-review
    descriptionEn: "Animal motifs in Amalfi style",
    previewCollection: "animals-preview",
    sortOrder: 3,
    categories: [
      { slug: "animal", labelNo: "Dyr", labelEn: "Animal", kind: "image", layerSlot: "animal", syncGroup: null, collection: "animals-preview", layerCollection: "animals-" },
      { slug: "main-color", labelNo: "Hovedfarge", labelEn: "Main color", kind: "color", layerSlot: "base", syncGroup: null, collection: "animals-maincolor" },
      { slug: "plants-color", labelNo: "Planter", labelEn: "Plants", kind: "color", layerSlot: "mid", syncGroup: null, collection: "animals-plantscolor" },
      { slug: "inner-circle", labelNo: "Indre sirkel", labelEn: "Inner circle", kind: "color", layerSlot: "detail", syncGroup: null, collection: "animals-innercircle" },
      { slug: "dots", labelNo: "Prikker", labelEn: "Dots", kind: "color", layerSlot: "extra", syncGroup: null, collection: "animals-dotter" },
    ],
  },
  {
    slug: "krabbe",
    name: "Krabbe",
    descriptionNo: "Krabbemotiv fra kysten", // TODO:nb-review
    descriptionEn: "Crab motif from the coast",
    previewCollection: "crabline",
    sortOrder: 4,
    categories: [
      { slug: "line", labelNo: "Linje", labelEn: "Line", kind: "image", layerSlot: "base", syncGroup: null, collection: "crabline" },
      { slug: "colors", labelNo: "Farger", labelEn: "Colors", kind: "color", layerSlot: "detail", syncGroup: "crab", collection: "crabcolors" },
      { slug: "borders", labelNo: "Kanter", labelEn: "Borders", kind: "color", layerSlot: "top", syncGroup: "crab", collection: "crab-kanter" },
    ],
  },
  {
    slug: "striper",
    name: "Striper",
    descriptionNo: "Enkle, elegante striper", // TODO:nb-review
    descriptionEn: "Simple, elegant stripes",
    previewCollection: "stripes",
    sortOrder: 5,
    categories: [
      { slug: "stripes", labelNo: "Striper", labelEn: "Stripes", kind: "color", layerSlot: "base", syncGroup: null, collection: "stripes" },
    ],
  },
  {
    slug: "juletre",
    name: "Juletre",
    descriptionNo: "Julemotiv med pynt", // TODO:nb-review
    descriptionEn: "Christmas tree with decorations",
    previewCollection: "juletre",
    sortOrder: 6,
    categories: [
      { slug: "tree", labelNo: "Tre", labelEn: "Tree", kind: "image", layerSlot: "base", syncGroup: null, collection: "juletre" },
      { slug: "decorations", labelNo: "Pynt", labelEn: "Decorations", kind: "color", layerSlot: "detail", syncGroup: null, collection: "julepynt" },
      { slug: "borders", labelNo: "Kanter", labelEn: "Borders", kind: "color", layerSlot: "top", syncGroup: null, collection: "juletre-kanter" },
    ],
  },
];

/** English drafts for product names (no live EN source). TODO:nb-review pair check. */
const PRODUCT_NAME_EN: Record<string, string> = {
  "bat-serveringsfat": "Boat serving dish",
  "serveringsfat-liten": "Serving dish, small",
  "serveringsfat-stor": "Serving dish, large",
  "vietri-dyp": "Vietri deep plate",
  "vietri-flat": "Vietri dinner plate",
  "vietri-asjett": "Vietri side plate",
  "vietri-asjett-dyp-flat": "Vietri set: side, deep & dinner",
  "vietri-dyp-flat": "Vietri set: deep & dinner",
};

// ───────────────────── storage upload ─────────────────────

const SKIP_EXISTING = process.env.IMPORT_SKIP_EXISTING === "1";
const existing = new Set<string>();

/** Pre-list the bucket once so resumable runs skip done files in O(1). */
async function prefetchExisting(prefix = "") {
  const { data, error } = await db.storage
    .from("assets")
    .list(prefix, { limit: 1000 });
  if (error || !data) return;
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      await prefetchExisting(path); // folder
    } else {
      existing.add(path);
    }
  }
}

async function uploadFromCdn(cdnUrl: string, path: string): Promise<string> {
  // resumable runs: skip files already in storage (idempotent + fast re-run)
  if (SKIP_EXISTING && existing.has(path)) return path;
  const res = await fetch(`${cdnUrl}?format=1500w`);
  if (!res.ok) throw new Error(`download ${cdnUrl}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/png";
  const { error } = await db.storage
    .from("assets")
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return path;
}

// ───────────────────────── main ─────────────────────────

const anomalies: string[] = [];
const counts: Record<string, number> = {};

async function main() {
  if (SKIP_EXISTING) {
    await prefetchExisting();
    console.log(`Storage prefetch: ${existing.size} existing objects`);
  }
  console.log("Scraping live collections…");
  const collections: Record<string, Item[]> = {};
  const slugs = new Set<string>(["plates", "palettes"]);
  for (const d of DESIGNS) {
    slugs.add(d.previewCollection);
    for (const c of d.categories) {
      slugs.add(c.collection);
      if (c.layerCollection) slugs.add(c.layerCollection);
    }
  }
  for (const slug of slugs) {
    collections[slug] = await scrape(slug);
    console.log(`  ${slug}: ${collections[slug].length}`);
  }

  // palette: hex → display name (naming dictionary, legacy behaviour)
  const paletteNames = new Map<string, string>();
  for (const p of collections["palettes"]) {
    if (p.hex) paletteNames.set(p.hex, p.rawName);
  }
  counts["palette colors"] = paletteNames.size;

  // 1) supplier first (NOT NULL FKs, ADR 0007)
  let { data: supplier } = await db
    .from("suppliers")
    .select("id")
    .eq("name", "Vietri")
    .maybeSingle();
  if (!supplier) {
    const ins = await db
      .from("suppliers")
      .insert({ name: "Vietri", notes: "Imported catalog owner (Italy)" })
      .select("id")
      .single();
    if (ins.error) throw ins.error;
    supplier = ins.data;
  }
  const supplierId = supplier.id as string;
  counts["suppliers"] = 1;

  // 2) designs + categories + options
  for (const spec of DESIGNS) {
    const previewItem = collections[spec.previewCollection][0];
    let previewPath: string | null = null;
    if (previewItem) {
      previewPath = await uploadFromCdn(
        previewItem.url,
        `designs/${spec.slug}/preview.png`
      );
    } else {
      anomalies.push(`design ${spec.slug}: empty preview collection`);
    }

    const design = await db
      .from("designs")
      .upsert(
        {
          slug: spec.slug,
          supplier_id: supplierId,
          name: spec.name,
          description_no: spec.descriptionNo,
          description_en: spec.descriptionEn,
          preview_image: previewPath,
          sort_order: spec.sortOrder,
          active: true,
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (design.error) throw design.error;
    const designId = design.data.id as string;

    for (const [ci, cat] of spec.categories.entries()) {
      const category = await db
        .from("option_categories")
        .upsert(
          {
            design_id: designId,
            slug: cat.slug,
            label_no: cat.labelNo,
            label_en: cat.labelEn,
            kind: cat.kind,
            layer_slot: cat.layerSlot,
            sync_group: cat.syncGroup,
            sort_order: ci,
          },
          { onConflict: "design_id,slug" }
        )
        .select("id")
        .single();
      if (category.error) throw category.error;
      const categoryId = category.data.id as string;

      // options: wipe + insert (no natural key; rerun-safe by outcome)
      const del = await db.from("options").delete().eq("category_id", categoryId);
      if (del.error) throw del.error;

      // ADR 0010: compositing-shape lookup by core name (Amalfi only)
      const layerByCore = new Map<string, string>();
      if (cat.layerCollection) {
        for (const layer of collections[cat.layerCollection]) {
          layerByCore.set(coreName(layer.rawName).toLowerCase(), layer.url);
        }
      }

      const items = collections[cat.collection];
      const rows = [];
      for (const [i, item] of items.entries()) {
        if (cat.kind === "color") {
          if (!item.hex) {
            anomalies.push(
              `${spec.slug}/${cat.slug}: item without hex skipped (${item.rawName})`
            );
            continue;
          }
          const name = paletteNames.get(item.hex) ?? coreName(item.rawName);
          if (!paletteNames.has(item.hex)) {
            anomalies.push(
              `${spec.slug}/${cat.slug}: hex ${item.hex} has no palette name (named "${name}")`
            );
          }
          // the swatch's pre-colored PNG IS the compositing layer (ADR 0010)
          const optionSlug = slugify(name) || `opt-${i}`;
          const layerImage = await uploadFromCdn(
            item.url,
            `designs/${spec.slug}/${cat.slug}/${optionSlug}.png`
          );
          rows.push({
            category_id: categoryId,
            name,
            hex: item.hex,
            layer_image: layerImage,
            sort_order: i,
            active: true,
          });
        } else {
          const name = coreName(item.rawName);
          const optionSlug = slugify(name) || `opt-${i}`;
          const image = await uploadFromCdn(
            item.url,
            `designs/${spec.slug}/${cat.slug}/${optionSlug}.png`
          );

          // compositing layer: matched shape (Amalfi) or the display PNG itself
          let layerImage = image;
          if (cat.layerCollection) {
            const shapeUrl = layerByCore.get(name.toLowerCase());
            if (shapeUrl) {
              layerImage = await uploadFromCdn(
                shapeUrl,
                `designs/${spec.slug}/${cat.slug}/${optionSlug}-shape.png`
              );
            } else {
              anomalies.push(
                `${spec.slug}/${cat.slug}: no compositing shape for "${name}" (display thumb reused as layer)`
              );
            }
          }

          rows.push({
            category_id: categoryId,
            name,
            image,
            layer_image: layerImage,
            sort_order: i,
            active: true,
          });
        }
      }
      if (rows.length > 0) {
        const ins = await db.from("options").insert(rows);
        if (ins.error) throw ins.error;
      }
      counts[`options ${spec.slug}/${cat.slug}`] = rows.length;
    }
  }
  counts["designs"] = DESIGNS.length;

  // 3) products from /plates
  let productCount = 0;
  for (const [i, item] of collections["plates"].entries()) {
    if (item.priceCents == null) {
      anomalies.push(`plates: "${item.rawName}" has no price, skipped`);
      continue;
    }
    const slug = slugify(item.rawName);
    const image = await uploadFromCdn(item.url, `products/${slug}.png`);
    const up = await db.from("products").upsert(
      {
        slug,
        supplier_id: supplierId,
        name_no: item.rawName,
        name_en: PRODUCT_NAME_EN[slug] ?? item.rawName,
        price_cents: item.priceCents,
        currency: "NOK",
        image,
        visible: true,
        sort_order: i,
      },
      { onConflict: "slug" }
    );
    if (up.error) throw up.error;
    productCount++;
  }
  counts["products"] = productCount;

  // 4) assign stable config-code codes to any new rows (ADR 0011, F04).
  // Deterministic + idempotent; never recalculates existing codes.
  const assigned = await assignMissingCodes(db);
  counts["codes assigned (design/option)"] =
    `${assigned.designs}/${assigned.options}` as unknown as number;

  // ── report ──
  console.log("\n── counts ──");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log("\n── anomalies ──");
  for (const a of anomalies) console.log(`  - ${a}`);
  if (anomalies.length === 0) console.log("  none");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
