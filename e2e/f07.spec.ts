import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { adminClient, loadEnvLocal } from "./helpers";

/** F07 — order management (back-office). Needs a seeded admin
 *  (ADMIN_EMAIL/PASSWORD) + the service role to seed a test order; the whole
 *  suite skips when either is absent (like F06/RLS in CI). */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasService = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
);
const ready = Boolean(EMAIL && PASSWORD) && hasService;

const CODE = `MK-E2E-${Date.now()}`;
let orderId = "";
let designSlug = "";

test.beforeAll(async () => {
  if (!ready) return;
  const db = adminClient();

  // a real design code → a minimal-but-valid config code (decode fills defaults)
  const { data: design } = await db
    .from("designs")
    .select("code, slug")
    .not("code", "is", null)
    .limit(1)
    .single();
  const { data: supplier } = await db
    .from("suppliers")
    .select("id, name")
    .limit(1)
    .single();
  designSlug = design?.slug ?? "";
  const configCode = design?.code ? `MK-${design.code}` : "MK-A";

  const { data: order } = await db
    .from("orders")
    .insert({
      code: CODE,
      customer_name: "E2E Tester",
      email: "e2e@example.no",
      phone: "+47 400 00 000",
      message: "Test order — F07",
      locale: "no",
      status: "new",
    })
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
    quantity: 4,
    config_code: configCode,
    config_snapshot: { designName: "Blomster 1", selections: [{ label: "Farge", option: "Blå", hex: "#456" }] },
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

// The list renders BOTH layouts in the DOM — a desktop table (`order-row`,
// hidden md:block) and mobile cards (`order-card`, md:hidden) — so we assert the
// one that's actually visible for the current project. Real mobile coverage, no skip.
const rowTestId = (testInfo: TestInfo) =>
  testInfo.project.name === "mobile" ? "order-card" : "order-row";
const seededRow = (page: Page, testInfo: TestInfo) =>
  page.locator(`[data-testid="${rowTestId(testInfo)}"][data-code="${CODE}"]`);

test("AC1: list shows the seeded order with KPIs", async ({ page }, testInfo) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await expect(page.getByTestId("admin-orders")).toBeVisible();
  await expect(page.getByTestId("kpi-new")).toBeVisible();
  await expect(seededRow(page, testInfo)).toBeVisible();
});

test("AC2: status filter narrows the list", async ({ page }, testInfo) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  // our order is 'new' → filtering to 'delivered' hides it
  await page.getByTestId("filter-status").selectOption("delivered");
  await page.getByTestId("filter-submit").click();
  await expect(seededRow(page, testInfo)).toHaveCount(0);
  // clearing brings it back
  await page.getByTestId("filter-clear").click();
  await expect(seededRow(page, testInfo)).toBeVisible();
});

test("AC2: search by order code finds the order", async ({ page }, testInfo) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.getByTestId("filter-q").fill(CODE);
  await page.getByTestId("filter-submit").click();
  await expect(page.getByTestId(rowTestId(testInfo))).toHaveCount(1);
  await expect(seededRow(page, testInfo)).toBeVisible();
});

test("AC3: status change persists and re-reads (F07b: confirmation required)", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByTestId("order-detail")).toBeVisible();

  await page.getByTestId("status-select").selectOption("confirmed");
  // F07b: first click shows the confirmation dialog
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm-dialog")).toBeVisible();
  // confirm the change
  await page.getByTestId("status-confirm").click();

  // Wait for the server action to settle (RSC refresh) BEFORE reloading, so we
  // don't race the revalidate. `order-detail[data-status]` is the page's source
  // of truth (read from the DB) for every status — unlike the status badge,
  // which the detail only renders for the `cancelled` state.
  await expect(page.getByTestId("order-detail")).toHaveAttribute(
    "data-status",
    "confirmed"
  );

  // re-read from the DB after a reload to prove persistence
  await page.reload();
  await expect(page.getByTestId("order-detail")).toHaveAttribute(
    "data-status",
    "confirmed"
  );
  await expect(page.getByTestId("status-select")).toHaveValue("confirmed");
});

test("AC4: internal notes persist", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto(`/admin/orders/${orderId}`);
  const note = `call back ${Date.now()}`;
  await page.getByTestId("notes-input").fill(note);
  await page.getByTestId("notes-save").click();
  await page.reload();
  await expect(page.getByTestId("notes-input")).toHaveValue(note);
});

test("AC5: config code link opens the configurator on that design", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto(`/admin/orders/${orderId}`);
  const link = page.getByTestId("config-code-link").first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/configurator\?design=/);
  if (designSlug) await expect(page).toHaveURL(new RegExp(`design=${designSlug}`));
});

test("AC6 (mobile): order card shown, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(!ready, "needs admin creds + service role");
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await login(page);
  await page.getByTestId("filter-q").fill(CODE);
  await page.getByTestId("filter-submit").click();
  await expect(
    page.locator(`[data-testid="order-card"][data-code="${CODE}"]`)
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
