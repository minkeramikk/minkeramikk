/**
 * One-off import of the new ceramics photo set into Supabase `products`.
 *
 * Reconciles the products catalogue to EXACTLY the PNGs found in --dir:
 *   - upsert BY SLUG: existing product → refresh image + price + pieces
 *     (names left untouched, so reviewed NO/EN survive); new slug → full insert
 *   - upload master `products/<slug>.png` + the `@256` WebP variant
 *     (same class/width as F26 → app serves the variant, master stays native)
 *   - DELETE any product whose slug is NOT in the set ("elimina i vecchi").
 *     SAFE: `order_items.product_id` is ON DELETE SET NULL (0001_schema.sql:150)
 *     and order_items carry name/price/supplier SNAPSHOTS, so deleting a product
 *     never breaks order history — it just unlinks the live row.
 *
 * Filename convention (same as the Squarespace import): "Name#<priceKr>.png".
 * macOS zips store å/ø/æ decomposed (NFD) → we normalise before slug/displaying.
 * Single supplier for now: Vietri.
 *
 * DRY-RUN by default (prints the plan, writes nothing). Execute with --yes.
 * Run by Daniele with the service-role key (reads web/.env.local).
 *
 *   npm run import:ceramics -- --dir=../docs/new_ceramiche/png          # plan
 *   npm run import:ceramics -- --dir=../docs/new_ceramiche/png --yes    # apply
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

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

// ───────────────────────── flags ─────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes("--yes");
const dirArg =
  args.find((a) => a.startsWith("--dir="))?.split("=")[1] ??
  "../docs/new_ceramiche/png";
// resolve --dir relative to where you run npm (web/), so "../docs/..." reaches
// the repo-root docs/ (one level above web/). Absolute paths pass through.
const SRC = resolve(process.cwd(), dirArg);

// ───────────────────────── slug (mirror src/lib/catalog/slug.ts) ─────────────
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

// ── English names + pieces, keyed by slug. Existing 8: update path ignores the
//    EN (names preserved); pieces still applied (the two Vietri sets + Tacosett).
const META: Record<string, { en: string; pieces: number }> = {
  // existing (refreshed photo, same price; pieces enforced)
  "bat-serveringsfat": { en: "Boat serving platter", pieces: 1 },
  "serveringsfat-liten": { en: "Serving platter, small", pieces: 1 },
  "serveringsfat-stor": { en: "Serving platter, large", pieces: 1 },
  "vietri-dyp": { en: "Vietri deep plate", pieces: 1 },
  "vietri-flat": { en: "Vietri flat plate", pieces: 1 },
  "vietri-asjett": { en: "Vietri side plate", pieces: 1 },
  "vietri-asjett-dyp-flat": { en: "Vietri set — side + deep + flat", pieces: 3 },
  "vietri-dyp-flat": { en: "Vietri set — deep + flat", pieces: 2 },
  // new
  cappuccinokopp: { en: "Cappuccino cup", pieces: 1 },
  "deluxe-tallerken": { en: "Deluxe plate", pieces: 1 },
  "dyp-tallerken": { en: "Deep plate", pieces: 1 },
  gryteunderlag: { en: "Trivet", pieces: 1 },
  "ildfastform-firkant": { en: "Square baking dish", pieces: 1 },
  "irregular-asjett": { en: "Irregular side plate", pieces: 1 },
  "irregular-dyp": { en: "Irregular deep plate", pieces: 1 },
  "irregular-stor": { en: "Irregular large plate", pieces: 1 },
  kaffekopp: { en: "Coffee cup", pieces: 1 },
  "karaffel-vietri": { en: "Vietri carafe", pieces: 1 },
  redskapstativ: { en: "Utensil holder", pieces: 1 },
  "sim-asjett": { en: "Sim side plate", pieces: 1 },
  "sim-dyp": { en: "Sim deep plate", pieces: 1 },
  "sim-flat": { en: "Sim flat plate", pieces: 1 },
  "sim-serveringsfat": { en: "Sim serving platter", pieces: 1 },
  tacosett: { en: "Taco set", pieces: 3 },
  "vanlig-asjett": { en: "Regular side plate", pieces: 1 },
  "vanlig-dyp-tallerken": { en: "Regular deep plate", pieces: 1 },
};

interface Item {
  file: string;
  nameNo: string;
  slug: string;
  priceCents: number;
  en: string;
  pieces: number;
}

function parseItems(): Item[] {
  const files = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith(".png"));
  const items: Item[] = [];
  for (const file of files) {
    const base = file.normalize("NFC").replace(/\.png$/i, "");
    const m = base.match(/^(.+)#(\d+)$/);
    if (!m) {
      console.warn(`⚠ skip (no #price): ${file}`);
      continue;
    }
    const nameNo = m[1].replace(/\+/g, " + ").replace(/\s+/g, " ").trim();
    const priceCents = parseInt(m[2], 10) * 100;
    const slug = slugify(m[1]);
    const meta = META[slug];
    if (!meta) console.warn(`⚠ no EN/pieces mapping for slug "${slug}" — EN=NO, pieces=1`);
    items.push({
      file,
      nameNo,
      slug,
      priceCents,
      en: meta?.en ?? nameNo,
      pieces: meta?.pieces ?? 1,
    });
  }
  return items;
}

async function vietriSupplierId(): Promise<string> {
  const { data, error } = await db.from("suppliers").select("id, name");
  if (error || !data?.length) throw new Error("no suppliers found");
  const vietri = data.find((s) => /vietri/i.test(s.name)) ?? (data.length === 1 ? data[0] : null);
  if (!vietri) throw new Error(`cannot pick supplier among: ${data.map((s) => s.name).join(", ")}`);
  return vietri.id;
}

async function uploadMaster(slug: string, buf: Buffer) {
  const path = `products/${slug}.png`;
  const { error } = await db.storage
    .from("assets")
    .upload(path, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`master upload ${path}: ${error.message}`);
  return path;
}

async function uploadVariant256(slug: string, buf: Buffer) {
  // mirrors src/lib/asset-variant-image.ts for the "products" class (256, q70)
  const data = await sharp(buf)
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  const path = `products/${slug}@256.webp`;
  const { error } = await db.storage
    .from("assets")
    .upload(path, data, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
  if (error) throw new Error(`variant upload ${path}: ${error.message}`);
}

async function main() {
  console.log(`Source: ${SRC}`);
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY-RUN (no writes; pass --yes to apply)\n");

  const items = parseItems();
  const targetSlugs = new Set(items.map((i) => i.slug));
  const supplierId = await vietriSupplierId();

  const { data: existing, error: exErr } = await db
    .from("products")
    .select("id, slug");
  if (exErr) throw new Error(`read products: ${exErr.message}`);
  const bySlug = new Map((existing ?? []).map((r) => [r.slug, r.id]));
  const toDelete = (existing ?? []).filter((r) => !targetSlugs.has(r.slug));

  // ── plan ──
  console.log("PLAN");
  for (const it of items) {
    const verb = bySlug.has(it.slug) ? "update " : "INSERT ";
    console.log(
      `  ${verb} ${it.slug.padEnd(26)} ${(it.priceCents / 100).toString().padStart(5)} kr  pieces=${it.pieces}  (${it.en})`
    );
  }
  for (const d of toDelete) console.log(`  DELETE  ${d.slug}  (not in new set)`);
  console.log(
    `\n  ${items.filter((i) => !bySlug.has(i.slug)).length} insert · ${items.filter((i) => bySlug.has(i.slug)).length} update · ${toDelete.length} delete\n`
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --yes to execute.");
    return;
  }

  // ── apply ──
  let ok = 0;
  for (const it of items) {
    const buf = readFileSync(join(SRC, it.file));
    const imagePath = await uploadMaster(it.slug, buf);
    await uploadVariant256(it.slug, buf);
    const id = bySlug.get(it.slug);
    if (id) {
      // existing: refresh image/price/pieces, keep reviewed names
      const { error } = await db
        .from("products")
        .update({ image: imagePath, price_cents: it.priceCents, pieces: it.pieces, currency: "NOK", visible: true })
        .eq("id", id);
      if (error) throw new Error(`update ${it.slug}: ${error.message}`);
    } else {
      const { error } = await db.from("products").insert({
        slug: it.slug,
        supplier_id: supplierId,
        name_no: it.nameNo,
        name_en: it.en,
        price_cents: it.priceCents,
        currency: "NOK",
        pieces: it.pieces,
        visible: true,
        sort_order: 0,
        image: imagePath,
      });
      if (error) throw new Error(`insert ${it.slug}: ${error.message}`);
    }
    ok++;
    console.log(`  ✓ ${it.slug}`);
  }

  for (const d of toDelete) {
    // best-effort storage cleanup, then DB (FK SET NULL keeps orders safe)
    await db.storage.from("assets").remove([`products/${d.slug}.png`, `products/${d.slug}@256.webp`]);
    const { error } = await db.from("products").delete().eq("id", d.id);
    if (error) console.error(`  ✗ delete ${d.slug}: ${error.message}`);
    else console.log(`  🗑  ${d.slug}`);
  }

  console.log(`\nDone: ${ok}/${items.length} imported, ${toDelete.length} removed.`);
  console.log("NB: public catalogue is cached (tag 'catalog'). Redeploy (or wait for revalidation) to see changes live.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
