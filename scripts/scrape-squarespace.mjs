/**
 * Estrae il catalogo dal sito Squarespace attuale (minkeramikk.no).
 * Le pagine raccolta sono "nascoste" e contengono gallery sections;
 * nomi/prezzi/colori sono codificati nei filename (es. "Båt Serveringsfat#1500.png",
 * "Floreal01_..._#3877b9.webp").
 *
 * Uso: node scripts/scrape-squarespace.mjs
 * Output: src/lib/catalog.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.minkeramikk.no";

const COLLECTIONS = [
  "plates",
  "palettes",
  "hovering-colors",
  "floreal1-detaljer",
  "floreal1-kanter",
  "floreal2-blader",
  "floreal2-kanter",
  "animals-preview",
  "animals-maincolor",
  "animals-plantscolor",
  "animals-innercircle",
  "animals-dotter",
  "crabcolors",
  "crabline",
  "crab-kanter",
  "stripes",
  "juletre",
  "juletre-kanter",
  "julepynt",
];

const IMG_RE =
  /https:\/\/images\.squarespace-cdn\.com\/content\/v1\/[^"?\s\\]+\.(?:png|jpg|jpeg|webp)/g;

function parseFilename(url) {
  const raw = decodeURIComponent(url.split("/").pop() ?? "");
  const base = raw.replace(/\.(png|jpe?g|webp)$/i, "").replace(/\+/g, " ");
  let name = base;
  let price = null;
  let hex = null;

  const priceMatch = base.match(/#(\d{2,5})$/);
  const hexMatch = base.match(/#([0-9a-f]{6})/i);

  if (priceMatch) {
    price = Number(priceMatch[1]);
    name = base.slice(0, priceMatch.index);
  } else if (hexMatch) {
    hex = `#${hexMatch[1].toLowerCase()}`;
    const after = base.slice(hexMatch.index + hexMatch[0].length);
    const before = base.slice(0, hexMatch.index);
    // il nome leggibile sta dopo l'hex (es. "Palettes_#001c81_Blu Stampa"),
    // altrimenti si usa la parte prima (es. "Floreal01_..._#3f6525")
    name = /[a-z]/i.test(after) ? after : before;
  }

  name = name
    .replace(/^[\s_#-]+|[\s_#-]+$/g, "")
    .replace(/---?|--/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ");
  return { name: name.normalize("NFC").trim(), price, hex };
}

async function scrape(slug) {
  const res = await fetch(`${BASE}/${slug}`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const html = await res.text();
  const urls = [...new Set(html.match(IMG_RE) ?? [])].filter(
    (u) => !u.includes("minkeramikk") // esclude il logo
  );
  return urls.map((url) => ({ url, ...parseFilename(url) }));
}

const catalog = { scrapedAt: new Date().toISOString(), collections: {} };
for (const slug of COLLECTIONS) {
  try {
    catalog.collections[slug] = await scrape(slug);
    console.log(`${slug}: ${catalog.collections[slug].length} item`);
  } catch (e) {
    console.error(`${slug}: ERRORE ${e.message}`);
    catalog.collections[slug] = [];
  }
}

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/catalog.json"
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(catalog, null, 2));
console.log(`\nScritto ${out}`);
