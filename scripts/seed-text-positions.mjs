/**
 * R5-TEXT-POSITION staging data (0.1-10): Krabbe accepts a customer
 * inscription, offered Top and Bottom; a «Tekst» option group is created
 * EMPTY if the design doesn't already have one (GARANZIA §7 — the group
 * stays in the catalogue, no options, never deleted).
 *
 *   npx tsx scripts/seed-text-positions.mjs                 # STAGING (creds da .env.local)
 *   npx tsx scripts/seed-text-positions.mjs --env prod      # PROD    (creds da .env.prod.local)
 *   npx tsx scripts/seed-text-positions.mjs --dry           # solo report, nessuna scrittura
 *
 * Idempotente. Design non trovato: report, nessuna scrittura.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : "staging";
const dry = args.includes("--dry");
const envFile = env === "prod" ? "../.env.prod.local" : "../.env.local";

for (const line of readFileSync(resolve(__dirname, envFile), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(`manca NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);

const DESIGNS = [{ slug: "krabbe", text_positions: ["top", "bottom"] }];
const TEXT_GROUP = { slug: "tekst", label_no: "Tekst", label_en: "Text" };

const db = createClient(url, key, { auth: { persistSession: false } });
console.log(`>> ${env.toUpperCase()} · ${url}${dry ? " · DRY RUN" : ""}`);

for (const d of DESIGNS) {
  const { data: design, error: dErr } = await db
    .from("designs")
    .select("id, accepts_custom_text, text_positions")
    .eq("slug", d.slug)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!design) {
    console.log(`!! design non trovato: ${d.slug}`);
    continue;
  }

  console.log(
    `   ${d.slug}: accepts_custom_text ${design.accepts_custom_text} -> true, ` +
      `text_positions ${JSON.stringify(design.text_positions)} -> ${JSON.stringify(d.text_positions)}`
  );
  if (!dry) {
    const { error } = await db
      .from("designs")
      .update({ accepts_custom_text: true, text_positions: d.text_positions })
      .eq("id", design.id);
    if (error) throw error;
  }

  const { data: cats, error: cErr } = await db
    .from("option_categories")
    .select("id, slug, label_no, label_en")
    .eq("design_id", design.id);
  if (cErr) throw cErr;
  const hasTextGroup = (cats ?? []).some((c) =>
    ["tekst", "text"].includes((c.slug ?? "").toLowerCase())
  );
  if (hasTextGroup) {
    console.log(`   ${d.slug}: gruppo «Tekst» già presente, nessuna scrittura`);
    continue;
  }

  console.log(`   ${d.slug}: creo option_categories «Tekst» vuoto`);
  if (!dry) {
    const { data: maxSort } = await db
      .from("option_categories")
      .select("sort_order")
      .eq("design_id", design.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await db.from("option_categories").insert({
      design_id: design.id,
      slug: TEXT_GROUP.slug,
      label_no: TEXT_GROUP.label_no,
      label_en: TEXT_GROUP.label_en,
      kind: "image",
      layer_slot: "detail",
      sort_order: (maxSort?.sort_order ?? -1) + 1,
    });
    if (error) throw error;
  }
}

const { data: after } = await db
  .from("designs")
  .select("slug, accepts_custom_text, text_positions")
  .in("slug", DESIGNS.map((d) => d.slug));
console.log("\nslug".padEnd(20) + "accepts_custom_text / text_positions");
for (const p of after ?? []) {
  console.log(`${p.slug.padEnd(19)} ${p.accepts_custom_text} / ${JSON.stringify(p.text_positions)}`);
}
