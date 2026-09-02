#!/usr/bin/env node
/**
 * F35 maintenance: find (and, with --apply, delete) orphan objects — objects
 * referenced by NOTHING in the DB. Two buckets, two different notions of
 * "referenced", one command and one dry-run:
 *
 *  1. `assets` — an object no image column points at. The token-based
 *     uploads (cache fix, Bug 1) leave the previous `…-<token>.ext` master +
 *     its F26 variant behind on every re-upload.
 *  2. `order-pdfs` — a customer summary whose order no longer exists. Storage
 *     has no foreign key, so deleting an order used to leave its PDF behind;
 *     `deleteOrder` (e2e/helpers.ts) removes it now, but every e2e run from
 *     before that fix left one. ONLY `summaries/<uuid>.pdf` is ever considered:
 *     a path this script does not recognise is reported and left alone.
 *
 * Dry-run by DEFAULT — prints what WOULD be removed. Pass --apply to delete.
 *
 *   npx tsx scripts/cleanup-orphan-assets.mjs           # dry-run
 *   npx tsx scripts/cleanup-orphan-assets.mjs --apply   # actually delete
 *
 * Sources of truth (a path referenced by ANY of these, plus its F26 variant, is
 * kept): options.image, options.layer_image, supplier_colors.swatch_image,
 * products.image, designs.preview_image, featured_configs.thumb_image,
 * design_images.image.
 * (featured_configs added beyond the card's list — the `featured/` thumbnails are
 * live assets; without it a dry-run flags them and --apply would delete them.)
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local.
 *
 * ponytail: dry-run + explicit --apply; at 6-designs / handful-of-reuploads scale
 * this is a manual sweep, not gate infrastructure.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { variantPath, variantWidths, isVariantPath } from "../src/lib/asset-variants.ts";

const APPLY = process.argv.includes("--apply");
/** `--only=<bucket>` limita la scopa a un bucket: le due hanno storie diverse e
 *  si applicano separatamente. Assente = tutte e due. */
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const sweeping = (bucket) => !ONLY || ONLY === bucket;
const BUCKET = "assets";
const SUMMARY_BUCKET = "order-pdfs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([A-Z_]+)=(.*)$/);
      return m ? [m[1], m[2].trim()] : null;
    })
    .filter(Boolean)
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Recursively collect every object path under a Storage prefix. */
async function listAll(prefix, bucket = BUCKET) {
  const out = [];
  const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) out.push(path); // a file has an id; a folder does not
    else out.push(...(await listAll(path, bucket)));
  }
  return out;
}

/** Storage.remove takes up to ~1000 paths per call; chunk to be safe. */
async function removeAll(bucket, paths) {
  for (let i = 0; i < paths.length; i += 500) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 500));
    if (error) console.error(`  ✗ ${error.message}`);
  }
}

async function column(table, col) {
  const { data, error } = await db.from(table).select(col).range(0, 99999);
  if (error) throw new Error(`select ${table}.${col}: ${error.message}`);
  return (data ?? []).map((r) => r[col]).filter(Boolean);
}

// ── referenced masters + their F26 variants ─────────────────────────────────
const referencedMasters = [
  ...(await column("options", "image")),
  ...(await column("options", "layer_image")),
  ...(await column("supplier_colors", "swatch_image")),
  ...(await column("products", "image")),
  ...(await column("designs", "preview_image")),
  ...(await column("featured_configs", "thumb_image")),
  ...(await column("design_images", "image")),
  // 0035: the Vipps QR is a Storage path on `settings`, like any product image.
  // Missing from this list until 2/9, which meant a `--apply` would have
  // deleted the LIVE QR — the one printed on the customer summary and on the
  // thank-you page. Found by a dry-run, never applied.
  ...(await column("settings", "vipps_qr_image")),
].filter((p) => !/^https?:\/\//.test(p)); // external URLs aren't bucket objects

const referenced = new Set();
for (const master of referencedMasters) {
  referenced.add(master);
  // EVERY width the app generates, not just the class one: `variantWidths` is
  // plural because a product master also gets the 48px thumb (asset-variants
  // .ts:103). With the singular `variantWidth` this script called every
  // `@256.webp` an orphan — 438 "orphan variants", almost all of them live.
  for (const w of variantWidths(master)) {
    const v = variantPath(master, w);
    if (v) referenced.add(v);
  }
}

// ── every object actually in the bucket ─────────────────────────────────────
const objects = await listAll("");
const orphans = objects.filter((o) => !referenced.has(o));

console.log(`── ${BUCKET} ──`);
if (!sweeping(BUCKET)) {
  console.log(`(skipped: --only=${ONLY})`);
} else if (orphans.length === 0) {
  console.log(`✓ No orphan objects — ${objects.length} in the bucket, all referenced.`);
} else {
  const orphanMasters = orphans.filter((o) => !isVariantPath(o));
  const orphanVariants = orphans.filter((o) => isVariantPath(o));
  console.log(
    `${APPLY ? "DELETING" : "Would delete"} ${orphans.length} orphan object(s) ` +
      `(${orphanMasters.length} masters + ${orphanVariants.length} variants) of ${objects.length} total:`
  );
  for (const o of orphans) console.log(`  ${o}`);
  if (APPLY) {
    await removeAll(BUCKET, orphans);
    console.log(`✓ Removed ${orphans.length} orphan object(s).`);
  }
}

// ── 2. `order-pdfs`: un riepilogo il cui ordine non esiste più ──────────────
// La regola è l'OPPOSTO della precedente: qui il riferimento non è una colonna
// che punta al file, è l'ESISTENZA della riga il cui id dà il nome al file.
// Nessuna corsa possibile nell'altro verso: l'ordine si scrive PRIMA del suo
// PDF (create.ts), quindi «oggetto senza ordine» non può essere un ordine
// appena nato.
console.log(`\n── ${SUMMARY_BUCKET} ──`);
if (!sweeping(SUMMARY_BUCKET)) {
  console.log(`(skipped: --only=${ONLY})`);
} else {
  const liveOrderIds = new Set(await column("orders", "id"));
  const summaries = await listAll("", SUMMARY_BUCKET);

  // SOLO la forma che questo script conosce. Un path diverso si segnala e non
  // si tocca: un file che non so leggere non è un file che posso dire orfano.
  const SUMMARY_RE =
    /^summaries\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/;
  const unknown = summaries.filter((p) => !SUMMARY_RE.test(p));
  const orphanSummaries = summaries.filter((p) => {
    const m = p.match(SUMMARY_RE);
    return m ? !liveOrderIds.has(m[1]) : false;
  });

  if (unknown.length > 0) {
    console.log(`⚠ ${unknown.length} path(s) of an unexpected shape — LEFT ALONE:`);
    for (const p of unknown) console.log(`  ${p}`);
  }
  if (orphanSummaries.length === 0) {
    console.log(
      `✓ No orphan summaries — ${summaries.length} in the bucket, ${liveOrderIds.size} live order(s).`
    );
  } else {
    console.log(
      `${APPLY ? "DELETING" : "Would delete"} ${orphanSummaries.length} orphan summary/-ies ` +
        `of ${summaries.length} total (${liveOrderIds.size} live order(s)):`
    );
    for (const o of orphanSummaries) console.log(`  ${o}`);
    if (APPLY) {
      await removeAll(SUMMARY_BUCKET, orphanSummaries);
      console.log(`✓ Removed ${orphanSummaries.length} orphan summary/-ies.`);
    }
  }
}

if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to delete.`);
