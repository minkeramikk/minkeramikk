/**
 * Backfill `designs.code` and `options.code` on the already-imported catalog
 * (ADR 0011). Deterministic + idempotent: assigns the next free safe-alphabet
 * code to rows whose code is NULL, in a stable order; rows that already have a
 * code are NEVER touched (never recalculated). Pure UPDATEs — no row churn, so
 * existing ids/codes referenced by orders stay valid.
 *
 *   designs:  one code, globally unique (stable order: sort_order, then slug)
 *   options:  one code per category, unique within it (order: sort_order, id)
 *
 * Run: npm run backfill:codes
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CODE_ALPHABET } from "../src/lib/configurator/config-code";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* env already set */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** Next free code not already used in this scope. Single char suffices for the
 *  current catalog (≤31 per scope); falls back to 2-char if a scope ever grows. */
function nextCode(used: Set<string>): string {
  for (const c of CODE_ALPHABET) if (!used.has(c)) return c;
  for (const a of CODE_ALPHABET)
    for (const b of CODE_ALPHABET) {
      const c = a + b;
      if (!used.has(c)) return c;
    }
  throw new Error("code space exhausted");
}

/**
 * Assign codes to any rows whose code is NULL. Deterministic + idempotent;
 * never touches existing codes. Reused by the import script so future imports
 * get codes too. Returns how many were assigned.
 */
export async function assignMissingCodes(
  db: SupabaseClient
): Promise<{ designs: number; options: number }> {
  let designsAssigned = 0;
  let optionsAssigned = 0;

  // ── designs ──
  const { data: designs, error: dErr } = await db
    .from("designs")
    .select("id, slug, code, sort_order")
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });
  if (dErr) throw dErr;

  const usedDesign = new Set(
    (designs ?? []).map((d) => d.code).filter((c): c is string => Boolean(c))
  );
  for (const d of designs ?? []) {
    if (d.code) continue; // never recalculate
    const code = nextCode(usedDesign);
    usedDesign.add(code);
    const { error } = await db.from("designs").update({ code }).eq("id", d.id);
    if (error) throw error;
    designsAssigned++;
  }

  // ── options, per category ──
  const { data: cats, error: cErr } = await db
    .from("option_categories")
    .select("id");
  if (cErr) throw cErr;

  for (const cat of cats ?? []) {
    const { data: opts, error: oErr } = await db
      .from("options")
      .select("id, code, sort_order")
      .eq("category_id", cat.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (oErr) throw oErr;

    const used = new Set(
      (opts ?? []).map((o) => o.code).filter((c): c is string => Boolean(c))
    );
    for (const o of opts ?? []) {
      if (o.code) continue;
      const code = nextCode(used);
      used.add(code);
      const { error } = await db.from("options").update({ code }).eq("id", o.id);
      if (error) throw error;
      optionsAssigned++;
    }
  }

  return { designs: designsAssigned, options: optionsAssigned };
}

async function main() {
  const r = await assignMissingCodes(db);
  console.log(
    `Backfill done: ${r.designs} design codes, ${r.options} option codes assigned.`
  );
}

// run as a script (not when imported by the import job)
if (process.argv[1] && process.argv[1].endsWith("backfill-codes.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
