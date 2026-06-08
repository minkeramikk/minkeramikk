import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, loadEnvLocal } from "./helpers";

/** F09 — catalog CRUD (products + suppliers) in /admin.
 *  RLS-negative + anon tests run always; the admin CRUD flow needs a seeded
 *  admin (ADMIN_EMAIL/ADMIN_PASSWORD) and is skipped when absent. */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasAdmin = Boolean(EMAIL && PASSWORD);

const TAG = "E2E F09 Plate";
const TMP_SUPPLIER = "E2E F09 Empty Lab";

test.afterAll(async () => {
  const db = adminClient();
  await db.from("products").delete().like("name_no", "E2E F09%");
  await db.from("suppliers").delete().eq("name", TMP_SUPPLIER);
});

test("RLS: anon cannot insert a product or a supplier", async () => {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const prod = await anon.from("products").insert({
    slug: "e2e-anon-should-fail",
    supplier_id: "00000000-0000-4000-8000-000000000000",
    name_no: "x",
    name_en: "x",
    price_cents: 100,
  });
  expect(prod.error).not.toBeNull(); // RLS blocks the write

  const sup = await anon.from("suppliers").insert({ name: "e2e anon lab" });
  expect(sup.error).not.toBeNull();
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });
}

test("AC1/AC2/AC3: create a product → shows in list + configurator step 3; hide → gone", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");
  const db = adminClient();
  const { data: vietri } = await db
    .from("suppliers")
    .select("id")
    .eq("name", "Vietri")
    .single();
  expect(vietri).not.toBeNull();

  await login(page);

  // create
  await page.goto("/admin/products/new");
  await page.getByTestId("product-name-no").fill(`${TAG} NO`);
  await page.getByTestId("product-name-en").fill(`${TAG} EN`);
  await page.getByTestId("product-price").fill("1 500,50"); // → 150050 cents
  await page.getByTestId("product-supplier").selectOption({ label: "Vietri" });
  await page.getByTestId("product-save").click();

  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.getByText(`${TAG} NO`)).toBeVisible();

  // reflected in the public configurator step 3 (Vietri design), with the parsed price
  await page.goto("/no/configurator?design=blomster-1&step=3");
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByText(`${TAG} NO`)).toBeVisible();
  await expect(page.getByText(/1\s?500,50/)).toBeVisible();

  // hide it → disappears from step 3
  await page.goto("/admin/products");
  const row = page.locator('[data-testid="product-row"]', { hasText: `${TAG} NO` });
  await row.getByTestId("product-toggle-visible").click(); // Yes → No
  await page.goto("/no/configurator?design=blomster-1&step=3");
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByText(`${TAG} NO`)).toHaveCount(0);
});

test("AC2: an invalid price is rejected with a form error (no save)", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");
  await login(page);
  await page.goto("/admin/products/new");
  await page.getByTestId("product-name-no").fill("E2E F09 BadPrice");
  await page.getByTestId("product-name-en").fill("E2E F09 BadPrice");
  await page.getByTestId("product-price").fill("not-a-price");
  await page.getByTestId("product-supplier").selectOption({ label: "Vietri" });
  await page.getByTestId("product-save").click();

  await expect(page.getByTestId("product-error")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/products\/new/);
});

test("AC4: delete supplier — blocked with catalog, allowed when empty", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");
  const db = adminClient();
  await login(page);

  // Vietri owns the imported catalog → delete is blocked (RESTRICT)
  const { data: vietri } = await db.from("suppliers").select("id").eq("name", "Vietri").single();
  await page.goto(`/admin/suppliers/${vietri!.id}`);
  await page.getByTestId("supplier-delete").click();
  await expect(page.getByTestId("supplier-delete-error")).toBeVisible();
  await expect(page.getByTestId("supplier-delete-error")).toContainText(/inactive/i);

  // a fresh supplier with no catalog → deletable
  await page.goto("/admin/suppliers/new");
  await page.getByTestId("supplier-name").fill(TMP_SUPPLIER);
  await page.getByTestId("supplier-save").click();
  await expect(page).toHaveURL(/\/admin\/suppliers$/);

  const { data: empty } = await db.from("suppliers").select("id").eq("name", TMP_SUPPLIER).single();
  await page.goto(`/admin/suppliers/${empty!.id}`);
  await page.getByTestId("supplier-delete").click();
  await expect(page).toHaveURL(/\/admin\/suppliers$/);
  await expect(page.getByText(TMP_SUPPLIER)).toHaveCount(0);
});
