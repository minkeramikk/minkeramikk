#!/usr/bin/env node
/**
 * R4-IMG-512 ③ — generate the missing `@512.webp` variant next to every master
 * in `products/`, so the step-3 card can stop downloading the 1024 the product
 * sheet needs. Masters are never touched, and neither is any existing variant:
 * this script only ever creates `<name>@512.webp` where it is absent.
 *
 * Descends from the F26 backfill (scripts/generate-asset-variants.mjs, removed
 * in a53a438) cut down to this one job. Classification, naming and resize come
 * from the app's own modules — Node 24 strips the types natively, so the
 * script and assetUrl() cannot disagree on what a variant is called.
 *
 * Usage (from web/):
 *   node scripts/backfill-product-card-variants.mjs                 # STAGING, dry run
 *   node scripts/backfill-product-card-variants.mjs --yes           # STAGING, execute
 *   node scripts/backfill-product-card-variants.mjs --env prod      # PROD, dry run
 *   node scripts/backfill-product-card-variants.mjs --env prod --yes
 *
 * Credentials: STAGING from `.env.local`; PROD from `.env.migration`, where
 * the project is `NEW_PROJECT_REF` and its service_role key sits — misleadingly
 * — under `NEXT_PUBLIC_SUPABASE_ANON_KEY` (known debt, see STATO). Hence the
 * role check below: writing to the wrong project is the one mistake this
 * script must not be able to make. `.env.prod.local` points at STAGING and is
 * deliberately not read here.
 *
 * Idempotent and resumable: an object whose @512 already exists is skipped, so
 * a run interrupted halfway is finished by running it again.
 *
 * MUST run on prod BEFORE the card starts asking for @512 — otherwise every
 * card 404s and falls back to the full master.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { isVariantPath, variantPath, PRODUCT_CARD_WIDTH } from "../src/lib/asset-variants.ts";
import { makeVariant } from "../src/lib/asset-variant-image.ts";

const BUCKET = "assets";
const PREFIX = "products";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const target = args.includes("--env") ? args[args.indexOf("--env") + 1] : "staging";
const apply = args.includes("--yes"); // dry run is the default
if (target !== "staging" && target !== "prod") {
  console.error(`--env must be "staging" or "prod" (got "${target}")`);
  process.exit(1);
}

// ── credentials ──────────────────────────────────────────────────────────────
function readEnv(file) {
  const out = {};
  for (const line of readFileSync(resolve(__dirname, "..", file), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** JWT payload claims, or null when the key is not a JWT at all. */
function claims(key) {
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64").toString());
  } catch {
    return null;
  }
}

const envFile = target === "prod" ? ".env.migration" : ".env.local";
const env = readEnv(envFile);
const ref = target === "prod" ? env.NEW_PROJECT_REF : undefined;
const url = ref ? `https://${ref}.supabase.co` : env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  target === "prod" ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(`missing project url / key in ${envFile}`);

// The prod key lives under an ANON_KEY name and the two environments' env files
// look alike: verify against the token itself, not against the variable name.
const c = claims(key);
if (!c) throw new Error(`the key in ${envFile} is not a JWT — cannot verify its role`);
if (c.role !== "service_role") {
  throw new Error(`the key in ${envFile} is "${c.role}", not service_role — it cannot write`);
}
if (ref && c.ref !== ref) {
  throw new Error(`the key in ${envFile} belongs to "${c.ref}", not NEW_PROJECT_REF "${ref}"`);
}

const db = createClient(url, key, { auth: { persistSession: false } });
console.log(`>> ${target.toUpperCase()} · ${url}${apply ? "" : " · DRY RUN"}`);

// ── list products/ ───────────────────────────────────────────────────────────
/** Every object under a prefix, with its byte size. Folders (no `id`) recurse. */
async function listAll(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id) out.push({ path, size: item.metadata?.size ?? 0 });
      else out.push(...(await listAll(path)));
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

const objects = await listAll(PREFIX);
const sizeOf = new Map(objects.map((o) => [o.path, o.size]));
const masters = objects.filter((o) => !isVariantPath(o.path));

const work = [];
let already = 0;
for (const m of masters) {
  const card = variantPath(m.path, PRODUCT_CARD_WIDTH);
  if (!card) continue; // not a recognizable image extension
  if (sizeOf.has(card)) already++;
  else work.push({ master: m.path, card });
}

console.log(
  `${masters.length} master(s) under ${PREFIX}/ — ${already} already have @${PRODUCT_CARD_WIDTH}, ` +
    `${work.length} to generate.`
);

if (!apply) {
  for (const w of work) console.log(`would create  ${w.card}`);
  console.log(`\nDry run. Re-run with --yes to execute.`);
  process.exit(0);
}

// ── generate ─────────────────────────────────────────────────────────────────
let created = 0;
let failed = 0;
for (const [i, w] of work.entries()) {
  const at = `[${i + 1}/${work.length}]`;
  try {
    const dl = await db.storage.from(BUCKET).download(w.master);
    if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "empty download");
    const v = await makeVariant(
      Buffer.from(await dl.data.arrayBuffer()),
      w.master,
      PRODUCT_CARD_WIDTH
    );
    if (!v) throw new Error("no variant class for this path");
    const up = await db.storage.from(BUCKET).upload(v.path, v.data, {
      contentType: v.contentType,
      cacheControl: v.cacheControl,
      upsert: false, // never overwrite: a variant that exists is already correct
    });
    // a concurrent run (or a re-run racing itself) got there first — fine
    if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
    sizeOf.set(v.path, v.data.length);
    created++;
    console.log(`${at} ${v.path}  ok  (${Math.round(v.data.length / 1024)} KB)`);
  } catch (e) {
    failed++;
    console.error(`${at} ${w.master}  x ${e.message}`);
  }
}

// ── the proof of the saving ──────────────────────────────────────────────────
const kb = (n) => `${Math.round(n / 1024)} KB`;
let big = 0;
let small = 0;
for (const m of masters) {
  const a = variantPath(m.path, 1024);
  const b = variantPath(m.path, PRODUCT_CARD_WIDTH);
  big += (a && sizeOf.get(a)) || 0;
  small += (b && sizeOf.get(b)) || 0;
}
console.log(
  `\n${masters.length} master(s) · ${created} variant(s) created · ${failed} failed\n` +
    `catalogue total  @1024: ${kb(big)}   @${PRODUCT_CARD_WIDTH}: ${kb(small)}` +
    (big ? `   (-${Math.round((1 - small / big) * 100)}%)` : "")
);
process.exit(failed ? 1 : 0);
