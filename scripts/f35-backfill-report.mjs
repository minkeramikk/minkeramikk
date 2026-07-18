/**
 * F35 · Dry-run backfill report (READ-ONLY, zero writes).
 *
 * Previews what migration 0022 would create when it normalises the existing
 * colour options onto per-supplier `supplier_colors` palettes, so Daniele + the
 * TL can validate BEFORE `make db-push-staging`. It re-runs the same grouping as
 * the migration backfill and flags anything the migration would silently absorb
 * or the CHECK would reject.
 *
 *   npx tsx scripts/f35-backfill-report.mjs        # staging creds from .env.local
 *
 * Exit code: non-zero if a STOP item is found (name collision that would break
 * UNIQUE(supplier_id,name), or a hex the `^#[0-9a-f]{6}$` CHECK would reject).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Same .env.local loader as rls.test.ts (secrets never land in the repo).
try {
  const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // no .env.local — fall through to the explicit check below
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in web/.env.local)."
  );
  process.exit(2);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const HEX_OK = /^#[0-9a-f]{6}$/; // exactly what the supplier_colors CHECK accepts
const HEX_UPPER = /^#[0-9A-Fa-f]{6}$/; // conforming once lowercased

async function selectAll(table, columns) {
  // supabase-js caps rows at 1000 by default; .range widens it so the report
  // can never lie by silently truncating. Fail loudly if we still hit the ceiling.
  const { data, error } = await db.from(table).select(columns).range(0, 9999);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  if ((data?.length ?? 0) >= 10000) {
    throw new Error(`select ${table}: hit the 10000-row cap — widen the range and re-run`);
  }
  return data ?? [];
}

async function main() {
  const [suppliers, designs, categories] = await Promise.all([
    selectAll("suppliers", "id, name"),
    selectAll("designs", "id, supplier_id, slug"),
    selectAll("option_categories", "id, kind, design_id, slug"),
  ]);

  // supplier_color_id only exists once 0022 is applied. Select it when present
  // (so the zombie check can tell a backfilled option apart from a real orphan);
  // pre-migration the column is absent → fall back and treat it as null.
  let options;
  try {
    options = await selectAll(
      "options",
      "id, name, hex, image, sort_order, category_id, supplier_color_id"
    );
  } catch {
    options = await selectAll("options", "id, name, hex, image, sort_order, category_id");
  }

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const designSupplier = new Map(designs.map((d) => [d.id, d.supplier_id]));
  const designSlug = new Map(designs.map((d) => [d.id, d.slug]));
  const colourCat = new Map(
    categories.filter((c) => c.kind === "color").map((c) => [c.id, c])
  );

  // Colour options carrying a hex — the migration's backfill population set.
  const colourOptions = options
    .filter((o) => colourCat.has(o.category_id) && o.hex != null)
    .map((o) => {
      const supplierId = designSupplier.get(colourCat.get(o.category_id).design_id);
      return { ...o, supplierId };
    })
    .filter((o) => o.supplierId);

  // Group per supplier → per lower(hex); winner = lowest (sort_order, id),
  // mirroring `distinct on (...) order by ..., o.sort_order, o.id`.
  const perSupplier = new Map(); // supplierId -> Map(lowerHex -> {winner, members[]})
  let stop = false;

  for (const o of colourOptions) {
    const lower = String(o.hex).toLowerCase();
    if (!perSupplier.has(o.supplierId)) perSupplier.set(o.supplierId, new Map());
    const byHex = perSupplier.get(o.supplierId);
    if (!byHex.has(lower)) byHex.set(lower, { members: [] });
    byHex.get(lower).members.push(o);
  }

  const nonConforming = [];
  for (const o of colourOptions) {
    const h = String(o.hex);
    if (HEX_OK.test(h)) continue;
    if (HEX_UPPER.test(h)) {
      nonConforming.push({ ...o, kind: "uppercase" }); // lowercased by backfill — warn only
    } else {
      nonConforming.push({ ...o, kind: "invalid" }); // CHECK would reject — STOP
      stop = true;
    }
  }

  for (const [supplierId, byHex] of perSupplier) {
    const sName = supplierName.get(supplierId) ?? supplierId;
    console.log(`\n━━ Supplier: ${sName} (${supplierId}) ━━`);

    // Build palette rows (winner per hex), ordered by lower(hex) like the migration.
    const palette = [...byHex.entries()]
      .map(([hex, g]) => {
        const winner = g.members
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)))[0];
        return { hex, name: winner.name, swatch: winner.image, sources: g.members.length };
      })
      .sort((a, b) => a.hex.localeCompare(b.hex));

    console.log(`  Palette (${palette.length} colours):`);
    palette.forEach((p, i) => {
      console.log(
        `   [${i}] ${p.hex}  ${p.swatch ? "◼ swatch" : "· no-swatch"}  "${p.name}"  (${p.sources} option(s))`
      );
    });

    // Implicit renames: a colour option whose name differs from the winning name.
    const winnerName = new Map(palette.map((p) => [p.hex, p.name]));
    const renames = [];
    for (const [hex, g] of byHex) {
      for (const m of g.members) {
        if (m.name !== winnerName.get(hex)) {
          renames.push({ hex, from: m.name, to: winnerName.get(hex) });
        }
      }
    }
    if (renames.length) {
      console.log(`  Implicit renames (${renames.length}) — these options realign to the palette name:`);
      for (const r of renames) console.log(`   ${r.hex}: "${r.from}" → "${r.to}"`);
    }

    // Name collisions: two distinct hexes sharing a name → breaks UNIQUE(supplier_id,name).
    const byName = new Map();
    for (const p of palette) {
      if (!byName.has(p.name)) byName.set(p.name, new Set());
      byName.get(p.name).add(p.hex);
    }
    for (const [name, hexes] of byName) {
      if (hexes.size > 1) {
        console.log(`  ⛔ NAME COLLISION: "${name}" used by ${hexes.size} hexes: ${[...hexes].join(", ")} — UNIQUE(supplier_id,name) would fail. STOP.`);
        stop = true;
      }
    }

    const noSwatch = palette.filter((p) => !p.swatch);
    if (noSwatch.length) {
      console.log(`  ⚠ ${noSwatch.length} palette colour(s) have no swatch photo (hex fallback only): ${noSwatch.map((p) => p.hex).join(", ")}`);
    }
  }

  // Real zombies: colour options the backfill can't cover — hex IS NULL AND no
  // palette link. The backfill only touches hex-bearing colour options, so these
  // stay without supplier_color_id; post-0022 the options_kind_shape trigger then
  // blocks every future update. Requiring supplier_color_id IS NULL is what keeps
  // this from false-flagging the (many) options the backfill correctly linked and
  // nulled — those are hex NULL but supplier_color_id SET. STOP if any remain.
  const zombies = options.filter(
    (o) =>
      colourCat.has(o.category_id) && o.hex == null && o.supplier_color_id == null
  );
  if (zombies.length) {
    console.log(
      `\n⛔ ${zombies.length} colour option(s) have hex IS NULL — the backfill leaves them without supplier_color_id and un-nulled, so the trigger would block every future update. STOP:`
    );
    for (const o of zombies) {
      const cat = colourCat.get(o.category_id);
      console.log(
        `   option ${o.id}  category "${cat.slug}"  design "${designSlug.get(cat.design_id) ?? cat.design_id}"`
      );
    }
    stop = true;
  }

  const upper = nonConforming.filter((o) => o.kind === "uppercase");
  const invalid = nonConforming.filter((o) => o.kind === "invalid");
  if (upper.length) {
    console.log(`\n⚠ ${upper.length} option hex(es) are UPPERCASE — the backfill lowercases them (non-fatal):`);
    for (const o of upper) console.log(`   option ${o.id}: "${o.hex}"`);
  }
  if (invalid.length) {
    console.log(`\n⛔ ${invalid.length} option hex(es) do NOT match ^#[0-9a-f]{6}$ — the CHECK would reject them. STOP:`);
    for (const o of invalid) console.log(`   option ${o.id}: "${o.hex}"`);
  }

  // Post-migration palette dump: the ACTUAL supplier_colors as they now exist.
  // Empty/absent pre-migration (table not created yet); the real verification
  // view right after `make db-push-prod`. Reference count = options pointing at
  // each colour via supplier_color_id.
  let palettes = [];
  try {
    palettes = await selectAll(
      "supplier_colors",
      "id, supplier_id, hex, name, swatch_image, sort_order"
    );
  } catch {
    palettes = []; // pre-migration: no table yet
  }
  if (palettes.length) {
    const refCount = new Map();
    for (const o of options) {
      if (o.supplier_color_id)
        refCount.set(o.supplier_color_id, (refCount.get(o.supplier_color_id) ?? 0) + 1);
    }
    const bySupplier = new Map();
    for (const c of palettes) {
      if (!bySupplier.has(c.supplier_id)) bySupplier.set(c.supplier_id, []);
      bySupplier.get(c.supplier_id).push(c);
    }
    console.log(`\n════ supplier_colors palette (post-migration, ${palettes.length} colours) ════`);
    for (const [supplierId, rows] of bySupplier) {
      rows.sort((a, b) => a.sort_order - b.sort_order || a.hex.localeCompare(b.hex));
      console.log(`\n  ${supplierName.get(supplierId) ?? supplierId} (${rows.length} colours):`);
      for (const c of rows) {
        console.log(
          `   [${c.sort_order}] ${c.hex}  ${c.swatch_image ? "◼ swatch" : "· no-swatch"}  "${c.name}"  ← ${refCount.get(c.id) ?? 0} option(s)`
        );
      }
    }
  }

  console.log(
    `\n${stop ? "⛔ STOP items present — resolve before db-push-staging." : "✓ No STOP items. Review the palette + renames above before pushing."}`
  );
  process.exit(stop ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
