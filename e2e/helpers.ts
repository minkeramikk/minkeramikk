import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

/** Load .env.local into process.env (used for live Supabase + admin creds). */
export function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* CI: no .env.local */
  }
}

/** Service-role client for test seeding/cleanup ONLY (never in app code paths). */
export function adminClient(): SupabaseClient {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Capability gates (skip cleanly when an env prerequisite is missing) ───────

loadEnvLocal();
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
export const HAS_ADMIN = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
export const HAS_SERVICE = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
);
/** Admin journeys need a seeded admin AND the service role to seed/clean data. */
export const ADMIN_READY = HAS_ADMIN && HAS_SERVICE;

// ── Resilient catalog discovery (NEVER hardcode slugs or counts) ──────────────
// The e2e DB is the live, shared catalog: it grows and gets edited. Tests must
// discover entities at runtime instead of pinning slugs/counts (the old suite
// broke when `vietri-flat` was renamed). See docs/release/ACCEPTANCE.md.

export interface DesignRef {
  slug: string;
  code: string | null;
  name: string;
}

export interface DesignRefWithId extends DesignRef {
  id: string;
}

/** The first active design in catalog order — the one the configurator preselects. */
export async function firstActiveDesign(): Promise<DesignRef> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("slug, code, name")
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .single();
  if (error) throw error;
  return data as DesignRef;
}

/** Every active design, in catalog order — for invariants that must hold on the
 *  WHOLE catalog, not just on the one design the configurator preselects. */
export async function activeDesignSlugs(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("slug")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((d) => d.slug as string);
}

/** Slug prefix for every design an e2e run creates; `sweepTmpDesigns` owns it. */
const TMP_DESIGN_PREFIX = "e2e-tmp-";

/**
 * L'UNICO progetto Supabase del progetto (docs/archive/TODO.md §1.1). Non
 * esiste un ambiente di staging separato: `.env.local`, `.env.prod.local` e
 * `.env.example` puntano tutti qui. Quindi questa allowlist NON dice "siamo in
 * staging" — dice "siamo sul progetto che ci aspettiamo", e impedisce di
 * seminare per sbaglio un progetto DIVERSO (il target di migrazione
 * `lfphyfkuuszqazkioxlr` in `.env.migration`, la copia di un collega, un URL
 * storto). Il fatto che questo sia anche il progetto di produzione è il motivo
 * per cui esiste la seconda metà della guardia, `MK_E2E_SEED`.
 */
const SEEDABLE_PROJECT_REFS = ["rqhsbpwvzesvqwdonirf"];

/**
 * Il seeding scrive nel catalogo VERO, quello che il sito pubblico serve.
 * Serve una scelta esplicita: senza `MK_E2E_SEED=1` non semina nessuno, e le
 * spec che ne hanno bisogno fanno uno skip DICHIARATO (lezione F07). Lancia,
 * non ritorna un booleano: un seed che parte per errore non deve avere modo di
 * essere ignorato.
 */
export function assertSeedingAllowed(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\./)?.[1] ?? "";
  if (!SEEDABLE_PROJECT_REFS.includes(ref)) {
    throw new Error(
      `[e2e seed] progetto Supabase inatteso: "${ref || url || "(nessun URL)"}". ` +
        `Seeding consentito solo su ${SEEDABLE_PROJECT_REFS.join(", ")}.`
    );
  }
  if (process.env.MK_E2E_SEED !== "1") {
    throw new Error(
      "[e2e seed] il seeding scrive nel catalogo reale (nessun progetto di " +
        "staging separato esiste): riesegui con MK_E2E_SEED=1 se è ciò che vuoi."
    );
  }
}

/** `true` quando le spec che seminano possono girare; altrove → skip dichiarato. */
export const CAN_SEED =
  process.env.MK_E2E_SEED === "1" &&
  SEEDABLE_PROJECT_REFS.includes(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(
      /^https:\/\/([a-z0-9]+)\.supabase\./
    )?.[1] ?? ""
  );

/**
 * R4-POLISH: the live catalog has no group named «Tekst»/«Text», so the
 * gating of the inscription field (lib/configurator/text-option.ts) cannot be
 * exercised against it. This seeds a throwaway design that HAS one — one image
 * group, one colour group and a «Tekst» group whose FIRST option is the
 * conventional "no text". Always paired with `deleteDesignBySlug` in a
 * `finally`, and `sweepTmpDesigns()` cleans up after a run that crashed.
 *
 * NB: the catalog is `unstable_cache`d (tag `catalog`). A server started BEFORE
 * the seed keeps serving the old list, so a spec that seeds must run against a
 * server started after it, or clear `.next/cache` first. In CI the server is
 * always fresh; locally: `rm -rf .next/cache` before `npx playwright test`.
 */
export async function seedTextGroupDesign(
  slug = `${TMP_DESIGN_PREFIX}tekst`
): Promise<{ slug: string; id: string }> {
  assertSeedingAllowed();
  const db = adminClient();
  await deleteDesignBySlug(slug);
  const { data: src, error: srcErr } = await db
    .from("designs")
    .select("id, supplier_id, description_step2_no, description_step2_en")
    .eq("slug", "amalfi-dyr")
    .single();
  if (srcErr) throw srcErr;

  const { data: design, error: dErr } = await db
    .from("designs")
    .insert({
      slug,
      name: "E2E TMP Tekst",
      name_no: "E2E TMP Tekst",
      name_en: "E2E TMP Text",
      supplier_id: src.supplier_id,
      active: true,
      sort_order: 999,
      accepts_custom_text: true,
      accepts_custom_notes: true,
      description_step2_no: src.description_step2_no,
      description_step2_en: src.description_step2_en,
    })
    .select("id")
    .single();
  if (dErr) throw dErr;

  // copy one image group and one colour group so the panel is realistic
  const { data: srcCats, error: cErr } = await db
    .from("option_categories")
    .select("*, options(*)")
    .eq("design_id", src.id)
    .in("slug", ["animal", "main-color"]);
  if (cErr) throw cErr;
  for (const c of srcCats ?? []) {
    const { data: nc } = await db
      .from("option_categories")
      .insert({
        design_id: design.id,
        slug: c.slug,
        label_no: c.label_no,
        label_en: c.label_en,
        kind: c.kind,
        layer_slot: c.layer_slot,
        sync_group: c.sync_group,
        sort_order: c.sort_order,
      })
      .select("id")
      .single();
    for (const o of (c.options ?? []) as Record<string, unknown>[]) {
      const { id: _id, category_id: _cat, ...rest } = o;
      await db.from("options").insert({ ...rest, category_id: nc!.id });
    }
  }

  // the «Tekst» group findTextGroup() recognises, first option = "no text".
  // Colour options need a supplier_color_id (name/hex come from the palette).
  const { data: tc } = await db
    .from("option_categories")
    .insert({
      design_id: design.id,
      slug: "tekst",
      label_no: "Tekst",
      label_en: "Text",
      kind: "color",
      layer_slot: "detail",
      sort_order: 90,
    })
    .select("id")
    .single();
  const { data: palette } = await db
    .from("supplier_colors")
    .select("id")
    .eq("supplier_id", src.supplier_id)
    .limit(3);
  const names = ["No color", "Tekst 1", "Tekst 2"];
  for (let i = 0; i < names.length; i++) {
    await db.from("options").insert({
      category_id: tc!.id,
      name: names[i],
      sort_order: i,
      active: true,
      is_default: i === 0,
      supplier_color_id: palette![i].id,
    });
  }
  return { slug, id: design.id };
}

/** Deletes a design and everything it owns. Safe on a slug that does not exist. */
export async function deleteDesignBySlug(slug: string): Promise<void> {
  const db = adminClient();
  const { data: design } = await db
    .from("designs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!design) return;
  const { data: cats } = await db
    .from("option_categories")
    .select("id")
    .eq("design_id", design.id);
  for (const c of cats ?? []) await db.from("options").delete().eq("category_id", c.id);
  await db.from("option_categories").delete().eq("design_id", design.id);
  await db.from("designs").delete().eq("id", design.id);
}

/** Lezione f35fix-src-…: un run che crasha lascia il design in catalogo. */
export async function sweepTmpDesigns(): Promise<void> {
  // Cancella dal catalogo VERO: deve obbedire allo stesso guard di chi ci scrive.
  if (!CAN_SEED) return;
  const { data } = await adminClient()
    .from("designs")
    .select("slug")
    .like("slug", `${TMP_DESIGN_PREFIX}%`);
  for (const d of data ?? []) await deleteDesignBySlug(d.slug as string);
}

/**
 * R2-2b: first active design with its id (needed for admin edit URL).
 * The id is used to navigate to /admin/designs/<id> for the flag toggle.
 */
export async function firstActiveDesignWithId(): Promise<DesignRefWithId> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("id, slug, code, name")
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .single();
  if (error) throw error;
  return data as DesignRefWithId;
}

/**
 * R2-2b: second active design (different from the first) — used to check
 * that designs WITHOUT the flag don't show the custom-notes block.
 * Returns null if there is only one active design.
 */
export async function secondActiveDesignWithId(): Promise<DesignRefWithId | null> {
  const first = await firstActiveDesignWithId();
  const { data, error } = await adminClient()
    .from("designs")
    .select("id, slug, code, name")
    .eq("active", true)
    .neq("id", first.id)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DesignRefWithId | null;
}

/**
 * F36 AC4: the first active design with NO gallery photos AND a real choice
 * (>=2 active options in some category) — a single-option category renders no
 * radiogroup, just an auto-picked group, so AC2 ("a choice updates preview and
 * URL") would have nothing to click. Discovered, never pinned: the shared
 * staging catalog is edited by the client, and photos landing on whatever
 * `firstActiveDesign()` returns is exactly what broke the AC2 assertion. Null
 * when every active design has photos.
 */
export async function firstActiveDesignWithoutPhotos(): Promise<DesignRef | null> {
  const { data, error } = await adminClient()
    .from("designs")
    .select(
      "slug, code, name, design_images(id), option_categories(id, options(id, active))"
    )
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;

  type Row = DesignRef & {
    design_images: { id: string }[];
    option_categories: { id: string; options: { active: boolean }[] }[];
  };
  const match = ((data ?? []) as Row[]).find(
    (d) =>
      d.design_images.length === 0 &&
      d.option_categories.some(
        (c) => c.options.filter((o) => o.active).length >= 2
      )
  );
  return match ? { slug: match.slug, code: match.code, name: match.name } : null;
}

/**
 * A design that has a real config `code` AND is active — so its config code
 * decodes against the codec set (getCodecDesigns = active designs) and the
 * admin-order detail renders a clickable config-code link.
 */
export async function designWithCode(): Promise<DesignRef> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("slug, code, name")
    .eq("active", true)
    .not("code", "is", null)
    .order("sort_order")
    .limit(1)
    .single();
  if (error) throw error;
  return data as DesignRef;
}

/**
 * R2-4b / F34 (ADR 0017): the first product a customer actually SEES at step 3
 * for a design — the supplier's visible products (sort_order) narrowed by the
 * design→product whitelist. Mirrors `effectiveProducts`: no whitelist rows →
 * first visible supplier product; some rows → first visible supplier product
 * that is whitelisted. Returns the id (admin edit URL) + slug (step-3 testid),
 * or null when the effective step-3 set is empty.
 *
 * Whitelist-aware since F34: before the whitelist, step 3 showed every visible
 * supplier product, so "first visible supplier product" was enough. Now a
 * whitelisted design hides the rest, and picking a non-whitelisted product left
 * the test waiting for a `product-<slug>` that never renders.
 */
export async function firstProductOfDesignSupplier(
  designId: string,
  supplierId: string
): Promise<{ id: string; slug: string; nameNo: string } | null> {
  const db = adminClient();
  const { data: products, error } = await db
    .from("products")
    .select("id, slug, name_no, supplier_id, visible, sort_order")
    .eq("supplier_id", supplierId)
    .eq("visible", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const { data: wl, error: wlErr } = await db
    .from("design_products")
    .select("product_id")
    .eq("design_id", designId);
  if (wlErr) throw wlErr;

  const whitelist = new Set((wl ?? []).map((r) => r.product_id));
  const effective =
    whitelist.size === 0
      ? products ?? []
      : (products ?? []).filter((p) => whitelist.has(p.id));
  const first = effective[0];
  if (!first) return null;
  return { id: first.id, slug: first.slug, nameNo: first.name_no };
}

/** First supplier (for seeding order items). */
export async function firstSupplier(): Promise<{ id: string; name: string }> {
  const { data, error } = await adminClient()
    .from("suppliers")
    .select("id, name")
    .limit(1)
    .single();
  if (error) throw error;
  return data as { id: string; name: string };
}

/**
 * Step-3 product cards for the current design (resilient locator).
 * R4-STEP3: cards are plain `<button data-testid="product-<slug>">`, not
 * `role="radio"` any more. Scoped `button[...]` (not just `[data-testid^=]`)
 * so it never picks up the child `product-thumb` <img> inside each card.
 */
export const ceramicCards = (page: Page) =>
  page.getByTestId("ceramics-step").locator('button[data-testid^="product-"]');

/**
 * Open the first available ceramic's sheet and add it to the cart.
 * Returns the product's visible name so callers can assert on the cart line.
 *
 * R4-STEP3: nothing is preselected any more — the qty stepper and "Add" live
 * inside `ProductSheet` (Radix-portalled to `document.body`, OUTSIDE
 * `ceramics-step`), so the card click is not optional and the sheet locator
 * must be page-level.
 */
export async function addFirstCeramic(page: Page): Promise<string> {
  await page.getByTestId("ceramics-step").waitFor();
  const first = ceramicCards(page).first();
  await expect(first).toBeVisible();
  const name = (await first.innerText()).split("\n")[0].trim();
  await first.click();
  const sheet = page.getByTestId("product-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("add-to-cart").click();
  await expect(sheet).toBeHidden();
  return name;
}

// ── Admin login ───────────────────────────────────────────────────────────────

export async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
}

// ── Order seeding (admin journeys) ────────────────────────────────────────────

export interface SeededOrder {
  orderId: string;
  code: string;
  supplierId: string;
  designSlug: string;
}

/**
 * Seed a minimal valid order + one item, with a config code that resolves to a
 * real design (so the config-code link in the detail page renders). Caller is
 * responsible for cleanup via `deleteOrder`.
 */
export async function seedOrder(prefix = "MK-E2E"): Promise<SeededOrder> {
  const db = adminClient();
  const design = await designWithCode();
  const supplier = await firstSupplier();
  const code = `${prefix}-${Date.now()}`;

  const { data: order, error } = await db
    .from("orders")
    .insert({
      code,
      customer_name: "E2E Tester",
      email: "e2e@example.no",
      phone: "+47 400 00 000",
      message: "Seeded by e2e — safe to delete",
      locale: "no",
      status: "new",
    })
    .select("id")
    .single();
  if (error) throw error;
  const orderId = (order as { id: string }).id;

  await db.from("order_items").insert({
    order_id: orderId,
    supplier_id: supplier.id,
    supplier_name_snapshot: supplier.name,
    product_name_snapshot: "E2E Plate",
    price_cents_snapshot: 50000,
    currency_snapshot: "NOK",
    quantity: 2,
    config_code: design.code ? `MK-${design.code}` : "MK-A",
    config_snapshot: {
      designSlug: design.slug,
      designName: design.name,
      selections: [{ label: "Detaljer", option: "Blå", hex: "#123456" }],
    },
  });

  return { orderId, code, supplierId: supplier.id, designSlug: design.slug };
}

export interface SeededDiscounts {
  restore: () => Promise<void>;
}

/**
 * R4-SCONTI — put a KNOWN scale on the DB for the duration of a spec, then put
 * back EXACTLY what was there (rows + the `settings` flag).
 *
 * Writes to `discount_tiers` and `settings`, i.e. to the config the PUBLIC
 * site reads: same blast radius as the catalog seeders, so same guard —
 * assertSeedingAllowed() throws unless MK_E2E_SEED=1 and the project ref is
 * on the allowlist (lezione f91609e). Specs gate themselves on CAN_SEED and
 * skip DECLARED (lezione F07), never silently.
 *
 * Writes the tables DIRECTLY with the service-role client instead of the
 * `replace_discount_tiers` RPC: migration 0033 (which fixes that RPC's
 * pg_safeupdate-rejected unqualified DELETE, SQLSTATE 21000) is not applied
 * yet, and this seeder does not need it — PostgREST requires a filter on
 * every delete anyway (`.gte("min_qty", 0)`), which satisfies pg_safeupdate
 * for free.
 *
 * `restore()` puts the flag back FIRST, then the scale: the public site reads
 * `quantity_discounts_enabled` to decide whether to even look at
 * `discount_tiers`, so a half-restored scale is never read while it's mid-
 * restore. A failed restore throws loudly instead of swallowing — this is the
 * config the live catalogue serves.
 */
export async function seedDiscountTiers(
  tiers: { min_qty: number; pct: number }[]
): Promise<SeededDiscounts> {
  assertSeedingAllowed();
  const db = adminClient();
  const before =
    (await db.from("discount_tiers").select("min_qty, pct, sort_order")).data ?? [];
  const flagBefore =
    (
      await db
        .from("settings")
        .select("quantity_discounts_enabled")
        .eq("id", 1)
        .maybeSingle()
    ).data?.quantity_discounts_enabled ?? false;

  const del = await db.from("discount_tiers").delete().gte("min_qty", 0);
  if (del.error) throw del.error;
  if (tiers.length > 0) {
    const ins = await db
      .from("discount_tiers")
      .insert(tiers.map((t, i) => ({ min_qty: t.min_qty, pct: t.pct, sort_order: i })));
    if (ins.error) throw ins.error;
  }
  const flagSet = await db
    .from("settings")
    .update({ quantity_discounts_enabled: tiers.length > 0 })
    .eq("id", 1);
  if (flagSet.error) throw flagSet.error;

  return {
    async restore() {
      const flagRes = await db
        .from("settings")
        .update({ quantity_discounts_enabled: flagBefore })
        .eq("id", 1);
      if (flagRes.error) {
        throw new Error(
          `[e2e seed] FAILED to restore quantity_discounts_enabled: ${flagRes.error.message}`
        );
      }
      const delRes = await db.from("discount_tiers").delete().gte("min_qty", 0);
      if (delRes.error) {
        throw new Error(
          `[e2e seed] FAILED to clear discount_tiers before restore: ${delRes.error.message}`
        );
      }
      if (before.length > 0) {
        const insRes = await db.from("discount_tiers").insert(before);
        if (insRes.error) {
          throw new Error(
            `[e2e seed] FAILED to restore discount_tiers rows: ${insRes.error.message}`
          );
        }
      }
    },
  };
}

/**
 * R4-SCONTI ② — seed ONE automation rule between two products of the SAME
 * supplier (D2: the suggested line inherits the trigger line's config code,
 * which means nothing across suppliers) and return a restore() that removes
 * it and puts `settings.automations_enabled` back.
 *
 * Same guard and shape as `seedDiscountTiers`: `assertSeedingAllowed()` first
 * (this writes discount_rules / discount_rule_products / settings, i.e. the
 * config the PUBLIC site reads), specs gate on `CAN_SEED` with a declared
 * skip (lezione F07). Writes the tables DIRECTLY with the service-role
 * client rather than the `replace_discount_rule_products` RPC: this seeder
 * only ever needs ONE trigger product, so a single insert already does what
 * the RPC's delete+insert would, and it keeps the spec independent of which
 * migrations have landed (same reasoning as `seedDiscountTiers`'s own note).
 *
 * `discount_mode` is always `'fixed'` — every e2e test that calls this is
 * about the fixed deal (the `inherited`/`none` modes are engine-level,
 * covered by `discount.test.ts`). Two rules can be seeded at once (one card
 * at a time, AC-SC6) as long as each caller restores in LIFO order — nested
 * try/finally, same idiom as cart.spec.ts's AC-SC3.
 *
 * `restore()` puts the flag back FIRST (same reasoning as
 * `seedDiscountTiers`: the public site reads `automations_enabled` before it
 * ever looks at `discount_rules`), then deletes the rule row
 * (`discount_rule_products` cascades, migration 0034). A failed restore
 * throws loudly instead of swallowing — this is the config the live
 * catalogue serves.
 */
/** Prefix for every `discount_rules.name` an e2e run creates; `sweepE2EDiscounts`
 *  owns it — same shape as `TMP_DESIGN_PREFIX` above. */
const E2E_RULE_PREFIX = "e2e-tmp-rule-";

export async function seedDiscountRule(opts: {
  triggerProductId: string;
  suggestedProductId: string;
  minQty: number;
  pct: number;
}): Promise<SeededDiscounts> {
  assertSeedingAllowed();
  const db = adminClient();
  const flagBefore =
    (
      await db.from("settings").select("automations_enabled").eq("id", 1).maybeSingle()
    ).data?.automations_enabled ?? false;

  const { data: rule, error } = await db
    .from("discount_rules")
    .insert({
      name: `${E2E_RULE_PREFIX}${Date.now()}`,
      enabled: true,
      trigger_min_qty: opts.minQty,
      suggested_product_id: opts.suggestedProductId,
      suggested_qty: 1,
      discount_mode: "fixed",
      discount_pct: opts.pct,
    })
    .select("id")
    .single();
  if (error) throw error;
  const ruleId = (rule as { id: string }).id;

  const linkRes = await db
    .from("discount_rule_products")
    .insert({ rule_id: ruleId, product_id: opts.triggerProductId });
  if (linkRes.error) throw linkRes.error;

  const flagSet = await db.from("settings").update({ automations_enabled: true }).eq("id", 1);
  if (flagSet.error) throw flagSet.error;

  return {
    async restore() {
      const flagRes = await db
        .from("settings")
        .update({ automations_enabled: flagBefore })
        .eq("id", 1);
      if (flagRes.error) {
        throw new Error(
          `[e2e seed] FAILED to restore automations_enabled: ${flagRes.error.message}`
        );
      }
      const delRes = await db.from("discount_rules").delete().eq("id", ruleId);
      if (delRes.error) {
        throw new Error(
          `[e2e seed] FAILED to delete seeded discount rule ${ruleId}: ${delRes.error.message}`
        );
      }
    },
  };
}

// The client's confirmed scale (AGENTS.md, GLOBAL-CONSTRAINTS.md:9, ratified
// 27/8) — the ONLY state `discount_tiers` should ever be in outside of a
// running test. Every seeded test scale is deliberately different from this
// one (see cart.spec.ts's own comment on that), precisely so `sweepE2EDiscounts`
// below can tell "mid-test" from "at rest" apart without an owner column.
const CONFIRMED_TIERS = [
  { min_qty: 4, pct: 5 },
  { min_qty: 6, pct: 8 },
  { min_qty: 8, pct: 10 },
  { min_qty: 12, pct: 15 },
];
const tierKey = (rows: { min_qty: number; pct: number }[]) =>
  rows
    .map((r) => `${r.min_qty}:${r.pct}`)
    .sort()
    .join(",");

/**
 * R4-SCONTI ② — a run that gets killed (SIGKILL, OOM, a cancelled CI job,
 * Ctrl-C) between `seedDiscountRule`'s/`seedDiscountTiers`'s flag write and
 * their own `finally` leaves the live shop showing a stray upsell or a stray
 * test scale, silently, until a human notices — staging serves the real
 * public site. Same lezione as `sweepTmpDesigns` (`:255` above: "un run che
 * crasha lascia il design in catalogo"), applied to both discount seeders.
 *
 * Rules: deletes every `discount_rules` row whose name carries
 * `E2E_RULE_PREFIX` (`discount_rule_products` cascades, migration 0034) and,
 * ONLY if it found any, puts `automations_enabled` back to false — never
 * touches the flag when there is nothing to clean, so a legitimate
 * "automations really are on" state is never clobbered. Tolerates
 * `discount_rules` not existing yet (42P01, migration 0034 not applied
 * anywhere at the time this was written): nothing to sweep from a table that
 * isn't there.
 *
 * Tiers: a `discount_tiers` mismatch against `CONFIRMED_TIERS` is, by the
 * invariant above, unambiguous proof of a crash leftover — restored to the
 * confirmed scale with the flag OFF (migration 0032's own default), and
 * left untouched otherwise.
 *
 * Guarded like every seeder (`assertSeedingAllowed`), and safe to call with
 * nothing to clean — the point is calling it defensively from a `beforeAll`,
 * whether or not the previous run actually crashed.
 */
export async function sweepE2EDiscounts(): Promise<void> {
  assertSeedingAllowed();
  const db = adminClient();

  const { data: strayRules, error: selErr } = await db
    .from("discount_rules")
    .select("id")
    .like("name", `${E2E_RULE_PREFIX}%`);
  if (selErr && selErr.code !== "42P01") throw selErr;
  if (strayRules && strayRules.length > 0) {
    const flagRes = await db.from("settings").update({ automations_enabled: false }).eq("id", 1);
    if (flagRes.error) {
      throw new Error(
        `[e2e sweep] FAILED to clear automations_enabled before removing stray rules: ${flagRes.error.message}`
      );
    }
    const delRes = await db
      .from("discount_rules")
      .delete()
      .in("id", strayRules.map((r) => r.id as string));
    if (delRes.error) {
      throw new Error(`[e2e sweep] FAILED to delete stray discount rules: ${delRes.error.message}`);
    }
  }

  const { data: tierRows, error: tierErr } = await db.from("discount_tiers").select("min_qty, pct");
  if (tierErr) throw tierErr;
  if (tierKey(tierRows ?? []) !== tierKey(CONFIRMED_TIERS)) {
    const flagRes = await db.from("settings").update({ quantity_discounts_enabled: false }).eq("id", 1);
    if (flagRes.error) {
      throw new Error(
        `[e2e sweep] FAILED to clear quantity_discounts_enabled before restoring the confirmed scale: ${flagRes.error.message}`
      );
    }
    const delT = await db.from("discount_tiers").delete().gte("min_qty", 0);
    if (delT.error) {
      throw new Error(`[e2e sweep] FAILED to clear discount_tiers before restoring the confirmed scale: ${delT.error.message}`);
    }
    const insT = await db
      .from("discount_tiers")
      .insert(CONFIRMED_TIERS.map((t, i) => ({ ...t, sort_order: i })));
    if (insT.error) {
      throw new Error(`[e2e sweep] FAILED to restore the confirmed discount_tiers scale: ${insT.error.message}`);
    }
  }
}

export async function deleteOrder(orderId: string) {
  if (!orderId) return;
  await adminClient().from("orders").delete().eq("id", orderId);
}

export async function deleteSupplier(supplierId: string) {
  if (!supplierId) return;
  await adminClient().from("suppliers").delete().eq("id", supplierId);
}

/**
 * Seed an order whose single item belongs to a THROWAWAY supplier with a given
 * email — so the supplier lab-PDF send goes to the test inbox, never to a real
 * laboratory. Caller cleans up via deleteOrder + deleteSupplier.
 */
export async function seedOrderWithSupplierEmail(
  email: string,
  prefix = "MK-LAB-E2E"
): Promise<SeededOrder & { tempSupplierId: string }> {
  const db = adminClient();
  const design = await designWithCode();
  const code = `${prefix}-${Date.now()}`;

  const { data: supplier, error: supErr } = await db
    .from("suppliers")
    .insert({ name: `E2E Lab ${Date.now()}`, email, active: true })
    .select("id, name")
    .single();
  if (supErr) throw supErr;
  const sup = supplier as { id: string; name: string };

  const { data: order, error } = await db
    .from("orders")
    .insert({
      code,
      customer_name: "E2E Lab Tester",
      email: "e2e@example.no",
      locale: "no",
      status: "new",
    })
    .select("id")
    .single();
  if (error) throw error;
  const orderId = (order as { id: string }).id;

  await db.from("order_items").insert({
    order_id: orderId,
    supplier_id: sup.id,
    supplier_name_snapshot: sup.name,
    product_name_snapshot: "E2E Lab Plate",
    price_cents_snapshot: 50000,
    currency_snapshot: "NOK",
    quantity: 2,
    config_code: design.code ? `MK-${design.code}` : "MK-A",
    config_snapshot: {
      designSlug: design.slug,
      designName: design.name,
      selections: [{ label: "Detaljer", option: "Blå", hex: "#123456" }],
    },
  });

  return {
    orderId,
    code,
    supplierId: sup.id,
    designSlug: design.slug,
    tempSupplierId: sup.id,
  };
}

/** Pixel overflow on the horizontal axis (mobile no-overflow assertions). */
export const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
