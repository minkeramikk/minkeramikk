/**
 * R2-1a — Set the per-design cover default (step-1 cover colour), the precise way.
 *
 * One-off ops tool, idempotent. Service-role (server-only) from .env.local —
 * same convention as seed-admin.ts / backfill scripts.
 *
 * HOW IT WORKS (no colour-guessing):
 *   Configure each design in the LIVE configurator exactly how you want its
 *   cover, press "copia codice" (F04) and paste the MK-… code into CODES below.
 *   The code encodes the chosen option for EVERY category, so the script sets
 *   them all as that category's `is_default` → the step-1 cover matches 1:1.
 *
 * SAFE BY DEFAULT: no flag = DRY-RUN (prints menu + plan, writes nothing).
 *   npx tsx scripts/set-cover-defaults.ts            # dry-run
 *   npx tsx scripts/set-cover-defaults.ts --apply    # apply CODES + MANUAL
 *
 * Re-runnable: per touched category it clears the old default then sets the new
 * one (never two at once → the partial-unique index is safe).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  toCodecDesign,
  decodeConfigCode,
  type CodecDesign,
} from "../src/lib/configurator/config-code";

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

// ── EDIT ME ──────────────────────────────────────────────────────────────────
// Preferred: the config code of each design, configured the way you want its
// cover (from the live configurator → "copia codice"). One per design.
const CODES: string[] = [
  // "MK-A-...-...",
  // "MK-B-...-...",
];

// Per-category cover defaults — chosen for a varied, colourful home (QA of the
// feature; Alessio will fine-tune later from the admin). One dominant hue/design.
const MANUAL: { design: string; category: string; code: string }[] = [
  // Blomster 1 → VERDE
  { design: "blomster-1", category: "details", code: "C" }, // Verde Scuro
  { design: "blomster-1", category: "borders", code: "C" }, // Verde Scuro
  // Blomster 2 → LILLA + bordo BLU
  { design: "blomster-2", category: "leaves", code: "A" }, // Lilla
  { design: "blomster-2", category: "borders", code: "S" }, // Blu Antico Scarico
  // Amalfi Dyr → ARANCIO (tartaruga) + dettagli TEAL
  { design: "amalfi-dyr", category: "animal", code: "M" }, // Skillepadde (tartaruga)
  { design: "amalfi-dyr", category: "main-color", code: "S" }, // Arancio Vietri
  { design: "amalfi-dyr", category: "plants-color", code: "D" }, // Verde Smeraldo
  { design: "amalfi-dyr", category: "inner-circle", code: "D" }, // Verde Smeraldo
  // Krabbe → BLU
  { design: "krabbe", category: "colors", code: "T" }, // Blu Antico
  { design: "krabbe", category: "borders", code: "T" }, // Blu Antico
  // Striper → ROSSO
  { design: "striper", category: "stripes", code: "K" }, // Rosso Vietri
  // Juletre → albero VERDE + bordo ROSSO (festivo)
  { design: "juletre", category: "decorations", code: "C" }, // Verde Scuro
  { design: "juletre", category: "borders", code: "K" }, // Rosso Vietri
];
// ─────────────────────────────────────────────────────────────────────────────

interface OptRow { id: string; code: string | null; name: string; hex: string | null; is_default: boolean; active: boolean; sort_order: number }
interface CatRow { id: string; slug: string; kind: string; sort_order: number; options: OptRow[] | null }
interface DesignRow { id: string; slug: string; code: string | null; name: string; sort_order: number; option_categories: CatRow[] | null }

async function loadCatalogue(): Promise<DesignRow[]> {
  const { data, error } = await db
    .from("designs")
    .select(
      "id, slug, code, name, sort_order, option_categories(id, slug, kind, sort_order, options(id, code, name, hex, is_default, active, sort_order))"
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DesignRow[];
}

const sortedCats = (d: DesignRow) =>
  (d.option_categories ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
const activeOpts = (c: CatRow) =>
  (c.options ?? []).filter((o) => o.active).sort((a, b) => a.sort_order - b.sort_order);

function printMenu(designs: DesignRow[]) {
  console.log("\n=== CATALOGO (opzioni attive · ● = default attuale) ===");
  for (const d of designs) {
    console.log(`\n▸ ${d.name}  [slug: ${d.slug}  code: ${d.code ?? "—"}]`);
    for (const c of sortedCats(d)) {
      const opts = activeOpts(c);
      if (!opts.length) continue;
      console.log(`  · ${c.slug} (${c.kind})`);
      for (const o of opts) {
        console.log(`      ${o.is_default ? "●" : " "} code=${(o.code ?? "—").padEnd(3)} ${o.name.padEnd(22)} ${o.hex ?? ""}`);
      }
    }
  }
}

/** Build the codec catalogue so decodeConfigCode can resolve a design code. */
function buildCodec(designs: DesignRow[]) {
  const codecs: CodecDesign[] = [];
  for (const d of designs) {
    const cd = toCodecDesign({
      code: d.code,
      slug: d.slug,
      categories: sortedCats(d).map((c) => ({
        slug: c.slug,
        options: activeOpts(c).map((o) => ({ id: o.id, code: o.code, isDefault: o.is_default })),
      })),
    });
    if (cd) codecs.push(cd);
  }
  return (code: string): CodecDesign | null => codecs.find((c) => c.code === code) ?? null;
}

async function clearThenSet(categoryId: string, optionId: string) {
  const clear = await db.from("options").update({ is_default: false }).eq("category_id", categoryId).neq("id", optionId);
  if (clear.error) throw clear.error;
  const set = await db.from("options").update({ is_default: true }).eq("id", optionId).select("id");
  if (set.error) throw set.error;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const designs = await loadCatalogue();
  const bySlug = new Map(designs.map((d) => [d.slug, d]));
  const findByCode = buildCodec(designs);

  // option lookup for labels + category resolution
  const optById = new Map<string, { name: string; code: string | null; categoryId: string }>();
  const catBySlug = new Map<string, Map<string, string>>(); // designSlug → (categorySlug → categoryId)
  for (const d of designs) {
    const cm = new Map<string, string>();
    for (const c of sortedCats(d)) {
      cm.set(c.slug, c.id);
      for (const o of c.options ?? []) optById.set(o.id, { name: o.name, code: o.code, categoryId: c.id });
    }
    catBySlug.set(d.slug, cm);
  }

  printMenu(designs);

  // Build the plan: categoryId → optionId (last wins), with a readable label.
  const plan = new Map<string, { optionId: string; label: string }>();

  for (const raw of CODES) {
    try {
      const { designSlug, selections } = decodeConfigCode(raw, findByCode);
      const d = bySlug.get(designSlug);
      console.log(`\n▸ code ${raw} → ${d?.name ?? designSlug}`);
      for (const [catSlug, optionId] of Object.entries(selections)) {
        const catId = catBySlug.get(designSlug)?.get(catSlug);
        const o = optById.get(optionId);
        if (!catId || !o) { console.log(`    ✗ ${catSlug}: opzione non risolta`); continue; }
        plan.set(catId, { optionId, label: `${d?.name ?? designSlug} · ${catSlug} → ${o.name} (${o.code})` });
      }
    } catch (e) {
      console.log(`  ✗ code "${raw}": ${(e as Error).message}`);
    }
  }

  for (const m of MANUAL) {
    const d = bySlug.get(m.design);
    const catId = catBySlug.get(m.design)?.get(m.category);
    if (!d || !catId) { console.log(`  ✗ MANUAL ${m.design}/${m.category}: non trovato`); continue; }
    const opt = (d.option_categories ?? []).find((c) => c.id === catId)?.options?.find((o) => o.code === m.code);
    if (!opt) { console.log(`  ✗ MANUAL ${m.design}/${m.category}: code ${m.code} non trovato`); continue; }
    plan.set(catId, { optionId: opt.id, label: `${d.name} · ${m.category} → ${opt.name} (${opt.code}) [manual]` });
  }

  console.log(`\n=== PIANO (${apply ? "APPLY" : "DRY-RUN"}) — ${plan.size} categorie ===`);
  for (const [, p] of plan) console.log(`  → ${p.label}`);

  if (!apply) { console.log(`\nDRY-RUN: nessuna scrittura. Se il piano è giusto, rilancia con --apply.`); return; }
  if (plan.size === 0) { console.log(`\nNiente da applicare (CODES/MANUAL vuoti?).`); return; }

  console.log(`\nApplico…`);
  for (const [catId, p] of plan) { await clearThenSet(catId, p.optionId); console.log(`  ✓ ${p.label}`); }
  console.log(`\nFatto. Ricarica lo step 1.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
