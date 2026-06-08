import { test, expect, type Page } from "@playwright/test";
import { adminClient, loadEnvLocal } from "./helpers";

/** F08 — per-supplier production-order PDF + send.
 *  The download route + send flow need a seeded admin + a test order; the guard
 *  test (anon → 401) always runs. */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasService = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
);
const ready = Boolean(EMAIL && PASSWORD) && hasService;

const CODE = `MK-E2E-F08-${Date.now()}`;
let orderId = "";
let supplierId = "";

test.beforeAll(async () => {
  if (!ready) return;
  const db = adminClient();
  const { data: design } = await db
    .from("designs")
    .select("code, slug, name")
    .not("code", "is", null)
    .limit(1)
    .single();
  const { data: supplier } = await db
    .from("suppliers")
    .select("id, name")
    .limit(1)
    .single();
  supplierId = supplier!.id;

  const { data: order } = await db
    .from("orders")
    .insert({ code: CODE, customer_name: "PII Tester", email: "pii@example.no", locale: "no", status: "new" })
    .select("id")
    .single();
  orderId = order!.id;

  await db.from("order_items").insert({
    order_id: orderId,
    supplier_id: supplier!.id,
    supplier_name_snapshot: supplier!.name,
    product_name_snapshot: "Vietri Flat",
    price_cents_snapshot: 50000,
    currency_snapshot: "NOK",
    quantity: 3,
    config_code: design?.code ? `MK-${design.code}` : "MK-A",
    config_snapshot: {
      designSlug: design?.slug ?? "blomster-1",
      designName: design?.name ?? "Blomster 1",
      selections: [{ label: "Detaljer", option: "Blå", hex: "#123456" }],
    },
  });
});

test.afterAll(async () => {
  if (!ready || !orderId) return;
  await adminClient().from("orders").delete().eq("id", orderId);
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("guard: anon GET of the PDF route → 401, no PDF", async ({ request }) => {
  const res = await request.get(
    "/api/admin/orders/11111111-1111-4111-8111-111111111111/pdf?supplier=22222222-2222-4222-8222-222222222222",
    { maxRedirects: 0 }
  );
  expect(res.status()).toBe(401);
});

test("AC: download returns a per-supplier production-order PDF", async ({ page }) => {
  test.skip(!ready, "needs admin + service role");
  await login(page);
  const res = await page.request.get(
    `/api/admin/orders/${orderId}/pdf?supplier=${supplierId}`
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 4).toString("latin1")).toBe("%PDF"); // valid PDF
  expect(body.length).toBeGreaterThan(1000);
});

test("AC: detail page exposes per-supplier PDF actions; send reports a result", async ({
  page,
}) => {
  test.skip(!ready, "needs admin + service role");
  await login(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByTestId("lab-pdf-actions").first()).toBeVisible();
  await expect(page.getByTestId("lab-pdf-download").first()).toHaveAttribute(
    "href",
    new RegExp(`/api/admin/orders/${orderId}/pdf\\?supplier=`)
  );
  // send → either "sent" or a "no email" warning (supplier may have no email)
  await page.getByTestId("lab-pdf-send").first().click();
  await expect(page.getByTestId("lab-pdf-result").first()).toBeVisible();
});
