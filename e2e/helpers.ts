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
 * R2-4b: first visible product of a design's supplier — the product that shows
 * at step 3 for that design. Returns the id (admin edit URL) + slug (step-3
 * testid). Null when the supplier has no visible product.
 */
export async function firstProductOfDesignSupplier(
  supplierId: string
): Promise<{ id: string; slug: string; nameNo: string } | null> {
  const { data, error } = await adminClient()
    .from("products")
    .select("id, slug, name_no, supplier_id, visible, sort_order")
    .eq("supplier_id", supplierId)
    .eq("visible", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, slug: data.slug, nameNo: data.name_no };
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

/** Step-3 product radios for the current design (resilient locator). */
export const ceramicRadios = (page: Page) =>
  page.getByTestId("ceramics-step").getByRole("radio");

/**
 * Select the first available ceramic and add it to the cart.
 * Returns the product's visible name so callers can assert on the cart line.
 */
export async function addFirstCeramic(page: Page): Promise<string> {
  await page.getByTestId("ceramics-step").waitFor();
  const first = ceramicRadios(page).first();
  await expect(first).toBeVisible();
  const name = (await first.innerText()).split("\n")[0].trim();
  await first.click();
  await page.getByTestId("add-to-cart").click();
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
