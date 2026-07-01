#!/usr/bin/env node
/**
 * F26: backfill resized WebP variants (`<name>@<width>.webp`) next to every
 * master image in the `assets` bucket. Masters are NEVER touched — lab-PDF
 * (F08) and compose-plate keep using the full-res originals.
 *
 * Classification + naming + resize come from the app's own modules
 * (src/lib/asset-variants.ts, src/lib/asset-variant-image.ts) — Node 24
 * strips types natively, so the script and assetUrl() can never disagree.
 *
 * Usage (from web/):
 *   node scripts/generate-asset-variants.mjs            # dry-run: prints the plan
 *   node scripts/generate-asset-variants.mjs --yes      # executes (resumable, Ctrl-C safe)
 *     [--concurrency=4]   parallel downloads/uploads per batch
 *     [--delay=250]       pause (ms) between batches
 *     [--timeout=20000]   per-operation timeout (ms)
 *     [--only=swatches|animal|products|designs]   one class at a time
 *     [--only-failed]     retry only the paths in .variants-failed.log
 *
 * Resumable: an asset is skipped when its variant already exists in Storage
 * OR its path is in scripts/.variants-progress.log (append-only checkpoint).
 * Failures land in scripts/.variants-failed.log and the run continues.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local.
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  assetClass,
  isVariantPath,
  variantPath,
  variantWidth,
} from "../src/lib/asset-variants.ts";
import { makeVariant } from "../src/lib/asset-variant-image.ts";

const BUCKET = "assets";
const PROGRESS_FILE = "scripts/.variants-progress.log";
const FAILED_FILE = "scripts/.variants-failed.log";
const CLASSES = ["swatches", "animal", "products", "designs"];

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes("--yes");
const ONLY_FAILED = args.includes("--only-failed");
const flag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : def;
};
const CONCURRENCY = Math.max(1, Number(flag("concurrency", "4")));
const DELAY = Math.max(0, Number(flag("delay", "250")));
const TIMEOUT = Math.max(1000, Number(flag("timeout", "20000")));
const ONLY = flag("only", null);
if (ONLY && !CLASSES.includes(ONLY)) {
  console.error(`--only must be one of: ${CLASSES.join("|")}`);
  process.exit(1);
}

// ── Supabase (service role, like cleanup-orphan-assets.mjs) ─────────────────
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

// ── helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`timeout after ${ms}ms (${label})`)), ms);
    }),
  ]);
}

function readLogLines(file) {
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, "utf8").split("\n").filter(Boolean));
}

/** recursively list every object path in the bucket (offset-paginated). */
async function listAll(prefix) {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    for (const item of data ?? []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) out.push(full);
      else out.push(...(await listAll(full)));
    }
    if ((data?.length ?? 0) < 1000) break;
    offset += 1000;
  }
  return out;
}

// ── build the work list ──────────────────────────────────────────────────────
console.log(`Listing bucket "${BUCKET}"…`);
const allObjects = await listAll("");
const existingVariants = new Set(allObjects.filter(isVariantPath));
const checkpoint = readLogLines(PROGRESS_FILE);

let masters = allObjects.filter((p) => assetClass(p) !== null);
if (ONLY) masters = masters.filter((p) => assetClass(p) === ONLY);
if (ONLY_FAILED) {
  const failed = readLogLines(FAILED_FILE);
  masters = masters.filter((p) => failed.has(p));
  console.log(`--only-failed: retrying ${masters.length} path(s) from ${FAILED_FILE}`);
}
// heaviest class first (matches the planned rollout order)
const ORDER = { products: 0, designs: 1, animal: 2, swatches: 3 };
masters.sort((a, b) => ORDER[assetClass(a)] - ORDER[assetClass(b)] || a.localeCompare(b));

const work = [];
let skipped = 0;
for (const p of masters) {
  const target = variantPath(p, variantWidth(p));
  if (!target) continue; // no recognizable image extension
  // checkpoint is keyed by the TARGET variant path (not the master): if a
  // master gets reclassified to a new width, the old log entry must not
  // suppress the regeneration. (Pre-fix logs stored master paths — those
  // simply never match a target, and the Storage-exists check still skips
  // anything truly done.)
  if (existingVariants.has(target) || checkpoint.has(target)) {
    skipped++;
    continue;
  }
  work.push({ path: p, target });
}

const byClass = {};
for (const m of masters) byClass[assetClass(m)] = (byClass[assetClass(m)] ?? 0) + 1;
console.log(
  `Found ${masters.length} master(s) ` +
    `(${Object.entries(byClass).map(([k, v]) => `${k}: ${v}`).join(", ")}) — ` +
    `${skipped} already done, ${work.length} to generate.`
);

if (!APPLY) {
  for (const w of work) {
    console.log(`would create  ${w.path}  →  @${variantWidth(w.path)}.webp`);
  }
  console.log(
    `\nDry-run: ${work.length} variant(s) to generate, ${skipped} skipped. ` +
      `Re-run with --yes to execute.`
  );
  process.exit(0);
}
if (work.length === 0) {
  console.log("✓ Nothing to do.");
  process.exit(0);
}

// ── execute (batched, throttled, retried) ────────────────────────────────────
let done = 0;
let failed = 0;
const total = work.length;

async function processOne(item, index) {
  const { path, target } = item;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const dl = await withTimeout(
        db.storage.from(BUCKET).download(path),
        TIMEOUT,
        `download ${path}`
      );
      if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "empty download");
      const buf = Buffer.from(
        await withTimeout(dl.data.arrayBuffer(), TIMEOUT, `read ${path}`)
      );
      const v = await makeVariant(buf, path);
      if (!v) throw new Error("unexpected: no variant class");
      const up = await withTimeout(
        db.storage.from(BUCKET).upload(v.path, v.data, {
          contentType: v.contentType,
          cacheControl: v.cacheControl,
          upsert: false,
        }),
        TIMEOUT,
        `upload ${v.path}`
      );
      // someone (or a previous interrupted run) created it meanwhile → fine
      if (up.error && !/exist|duplicate/i.test(up.error.message)) {
        throw new Error(up.error.message);
      }
      appendFileSync(PROGRESS_FILE, `${target}\n`);
      done++;
      console.log(
        `[${index + 1}/${total}] ${path} → @${variantWidth(path)}.webp  ok ` +
          `(skip: ${skipped}, done: ${done}, fail: ${failed})`
      );
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  failed++;
  appendFileSync(FAILED_FILE, `${path}\n`);
  console.error(
    `[${index + 1}/${total}] ${path}  ✗ ${lastErr?.message ?? lastErr} ` +
      `(skip: ${skipped}, done: ${done}, fail: ${failed})`
  );
}

for (let i = 0; i < work.length; i += CONCURRENCY) {
  const batch = work.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map((item, j) => processOne(item, i + j)));
  if (DELAY && i + CONCURRENCY < work.length) await sleep(DELAY);
}

console.log(
  `\nDone — generated: ${done}, skipped: ${skipped}, failed: ${failed}.` +
    (failed ? `\nRetry failures with: node scripts/generate-asset-variants.mjs --yes --only-failed` : "")
);
process.exit(failed ? 1 : 0);
