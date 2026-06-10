#!/usr/bin/env node
/**
 * Maintenance: remove orphan Storage folders under `designs/<slug>/` whose
 * design no longer exists (e.g. designs deleted from the Supabase dashboard,
 * which doesn't run the `deleteDesign` action that frees assets).
 *
 * Shared `swatches/` are never touched.
 *
 * Usage (from web/):
 *   node scripts/cleanup-orphan-assets.mjs          # dry-run: lists what WOULD be deleted
 *   node scripts/cleanup-orphan-assets.mjs --yes     # actually delete
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--yes");
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

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/** recursively collect object paths under a storage prefix */
async function listAll(prefix) {
  const out = [];
  const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.id) out.push(`${prefix}/${item.name}`);
    else out.push(...(await listAll(`${prefix}/${item.name}`)));
  }
  return out;
}

const { data: designs, error } = await db.from("designs").select("slug");
if (error) throw error;
const liveSlugs = new Set((designs ?? []).map((d) => d.slug));

const { data: top } = await db.storage.from(BUCKET).list("designs", { limit: 1000 });
const folders = (top ?? []).filter((x) => x.id === null).map((x) => x.name);
const orphans = folders.filter((f) => !liveSlugs.has(f));

if (orphans.length === 0) {
  console.log("✓ No orphan folders — storage is clean.");
  process.exit(0);
}

let total = 0;
for (const f of orphans) {
  const paths = await listAll(`designs/${f}`);
  total += paths.length;
  console.log(`${APPLY ? "DELETING" : "would delete"}  designs/${f}/  (${paths.length} objects)`);
  if (APPLY && paths.length) {
    const { error: rmErr } = await db.storage.from(BUCKET).remove(paths);
    if (rmErr) console.error(`  ✗ ${rmErr.message}`);
    else console.log("  ✓ removed");
  }
}

console.log(
  APPLY
    ? `\nDone — removed ${total} objects from ${orphans.length} orphan folders.`
    : `\nDry-run: ${total} objects in ${orphans.length} orphan folders. Re-run with --yes to delete.`
);
