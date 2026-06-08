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
import { createClient } from "@supabase/supabase-js";
import { assignMissingCodes } from "../src/lib/configurator/assign-codes";

// Re-exported so the import job (`import-squarespace.ts`) keeps importing it
// from here, while the implementation lives in the shared lib module (also used
// by the F10 back-office create flows).
export { assignMissingCodes };

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
