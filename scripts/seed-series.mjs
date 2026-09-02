/**
 * Serie allo step 3 — accende il raggruppamento (feature già in prod, dormiente).
 * Solo DATI: compila products.series_no / series_en sui 23 prodotti.
 * Tassonomia: docs/revision4/serie-checklist.md.
 *
 *   npx tsx scripts/seed-series.mjs                 # STAGING (creds da .env.local)
 *   npx tsx scripts/seed-series.mjs --env prod      # PROD    (creds da .env.prod.local)
 *   npx tsx scripts/seed-series.mjs --dry           # solo report, nessuna scrittura
 *
 * Idempotente. Prodotti con slug non in lista restano com'erano.
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

const SERIES = [
  { no: "Sett", en: "Sets", slugs: ["vietri-dyp-flat", "vietri-asjett-dyp-flat", "tacosett"] },
  { no: "Tallerkener", en: "Plates", slugs: ["deluxe-tallerken", "irregular-asjett", "irregular-dyp", "irregular-stor", "vietri-asjett", "vietri-dyp", "vietri-flat"] },
  { no: "Servering og skåler", en: "Serving & bowls", slugs: ["bat-serveringsfat", "bat-serveringsfat-sma", "serveringsfat-liten", "serveringsfat-stor", "salatskal", "salatskal-stor", "ildfastform-firkant"] },
  { no: "Karafler og kopper", en: "Jugs & cups", slugs: ["karaffel-vietri", "vietri-karaffel-sma", "kaffekopp", "cappuccinokopp"] },
  { no: "Tilbehør", en: "Accessories", slugs: ["gryteunderlag", "redskapstativ"] },
];

const db = createClient(url, key, { auth: { persistSession: false } });
console.log(`>> ${env.toUpperCase()} · ${url}${dry ? " · DRY RUN" : ""}`);

const { data: before, error: e0 } = await db.from("products").select("slug, series_no, series_en, sort_order");
if (e0) throw e0;
const known = new Set(SERIES.flatMap((s) => s.slugs));
const unknown = before.filter((p) => !known.has(p.slug)).map((p) => p.slug);
if (unknown.length) console.log(`!! prodotti senza serie in lista (restano com'erano): ${unknown.join(", ")}`);

for (const s of SERIES) {
  const present = s.slugs.filter((slug) => before.some((p) => p.slug === slug));
  const missing = s.slugs.filter((slug) => !present.includes(slug));
  if (missing.length) console.log(`!! ${s.no}: slug non trovati: ${missing.join(", ")}`);
  if (dry || present.length === 0) continue;
  const { error } = await db.from("products").update({ series_no: s.no, series_en: s.en }).in("slug", present);
  if (error) throw error;
  console.log(`   ${s.no} / ${s.en} → ${present.length} prodotti`);
}

const { data: after } = await db.from("products").select("slug, series_no, series_en, sort_order").order("sort_order");
console.log("\nslug".padEnd(28) + "series_no / series_en");
for (const p of after ?? before) console.log(`${p.slug.padEnd(27)} ${p.series_no ?? "—"} / ${p.series_en ?? "—"}`);
