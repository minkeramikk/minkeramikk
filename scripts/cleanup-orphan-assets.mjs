#!/usr/bin/env node
/**
 * F35 maintenance: find (and, with --apply, delete) orphan objects in the
 * `assets` bucket — objects referenced by NOTHING in the DB. The token-based
 * uploads (cache fix, Bug 1) leave the previous `…-<token>.ext` master + its F26
 * variant behind on every re-upload; this sweep collects them.
 *
 * Dry-run by DEFAULT — prints what WOULD be removed. Pass --apply to delete.
 *
 *   npx tsx scripts/cleanup-orphan-assets.mjs           # dry-run
 *   npx tsx scripts/cleanup-orphan-assets.mjs --apply   # actually delete
 *
 * Sources of truth (a path referenced by ANY of these, plus its F26 variant, is
 * kept): options.image, options.layer_image, supplier_colors.swatch_image,
 * products.image, designs.preview_image, featured_configs.thumb_image.
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
import { variantPath, variantWidth, isVariantPath } from "../src/lib/asset-variants.ts";

const APPLY = process.argv.includes("--apply");
const BUCKET = "assets";

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
async function listAll(prefix) {
  const out = [];
  const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) out.push(path); // a file has an id; a folder does not
    else out.push(...(await listAll(path)));
  }
  return out;
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
].filter((p) => !/^https?:\/\//.test(p)); // external URLs aren't bucket objects

const referenced = new Set();
for (const master of referencedMasters) {
  referenced.add(master);
  const w = variantWidth(master);
  const v = w ? variantPath(master, w) : null;
  if (v) referenced.add(v);
}

// ── every object actually in the bucket ─────────────────────────────────────
const objects = await listAll("");
const orphans = objects.filter((o) => !referenced.has(o));

if (orphans.length === 0) {
  console.log(`✓ No orphan objects — ${objects.length} in the bucket, all referenced.`);
  process.exit(0);
}

const orphanMasters = orphans.filter((o) => !isVariantPath(o));
const orphanVariants = orphans.filter((o) => isVariantPath(o));
console.log(
  `${APPLY ? "DELETING" : "Would delete"} ${orphans.length} orphan object(s) ` +
    `(${orphanMasters.length} masters + ${orphanVariants.length} variants) of ${objects.length} total:`
);
for (const o of orphans) console.log(`  ${o}`);

if (APPLY) {
  // Storage.remove takes up to ~1000 paths per call; chunk to be safe.
  for (let i = 0; i < orphans.length; i += 500) {
    const chunk = orphans.slice(i, i + 500);
    const { error } = await db.storage.from(BUCKET).remove(chunk);
    if (error) console.error(`  ✗ ${error.message}`);
  }
  console.log(`\n✓ Removed ${orphans.length} orphan object(s).`);
} else {
  console.log(`\nDry-run only. Re-run with --apply to delete.`);
}
