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

/**
 * R4-STEP2: sotto md lo step 2 è un editor a tab — descrizione, foto,
 * «Lås farger», note colore e scritta vivono nella tab «Detaljer». Su desktop
 * la tab non esiste e i blocchi sono già in pagina: no-op.
 */
export async function openStep2Extras(page: Page): Promise<void> {
  const tab = page.getByTestId("category-tab-extras");
  if (await tab.isVisible().catch(() => false)) await tab.click();
}
