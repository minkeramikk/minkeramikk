import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  ADMIN_READY,
  loginAdmin,
  seedOrder,
  deleteOrder,
  adminClient,
  type SeededOrder,
} from "./helpers";

/**
 * Journey 6 — Admin: gestione ordini. ACCEPTANCE.md §6 (storia F07/F07b).
 * Si auto-skippa senza admin creds + service role (per seedare l'ordine).
 */

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

let seeded: SeededOrder;
test.beforeAll(async () => {
  seeded = await seedOrder("MK-ORD-E2E");
});
test.afterAll(async () => {
  await deleteOrder(seeded?.orderId ?? "");
});

const rowTestId = (t: TestInfo) =>
  t.project.name === "mobile" ? "order-card" : "order-row";
const seededRow = (page: Page, t: TestInfo) =>
  page.locator(`[data-testid="${rowTestId(t)}"][data-code="${seeded.code}"]`);

test("AC1: list shows the seeded order with KPIs", async ({ page }, t) => {
  await loginAdmin(page);
  await expect(page.getByTestId("admin-orders")).toBeVisible();
  await expect(page.getByTestId("kpi-new")).toBeVisible();
  await expect(seededRow(page, t)).toBeVisible();
});

test("AC2: status filter narrows; clearing restores", async ({ page }, t) => {
  await loginAdmin(page);
  await page.getByTestId("filter-status").selectOption("delivered");
  await page.getByTestId("filter-submit").click();
  await expect(seededRow(page, t)).toHaveCount(0);
  await page.getByTestId("filter-clear").click();
  await expect(seededRow(page, t)).toBeVisible();
});

test("AC2: search by order code finds the order", async ({ page }, t) => {
  await loginAdmin(page);
  await page.getByTestId("filter-q").fill(seeded.code);
  await page.getByTestId("filter-submit").click();
  await expect(page.getByTestId(rowTestId(t))).toHaveCount(1);
  await expect(seededRow(page, t)).toBeVisible();
});

test("AC3: status change requires confirmation, persists and re-reads", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await expect(page.getByTestId("order-detail")).toBeVisible();

  await page.getByTestId("status-select").selectOption("confirmed");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm-dialog")).toBeVisible();
  await page.getByTestId("status-confirm").click();

  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "confirmed");
  await page.reload();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "confirmed");
  await expect(page.getByTestId("status-select")).toHaveValue("confirmed");
});

test("AC3: cancelling the confirmation makes no change", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const before = await page.getByTestId("order-detail").getAttribute("data-status");

  await page.getByTestId("status-select").selectOption("cancelled");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm-dialog")).toBeVisible();
  await page.getByTestId("status-cancel").click();

  await expect(page.getByTestId("status-confirm-dialog")).toBeHidden();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", before!);
});

test("AC4: internal notes persist", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const note = `call back ${Date.now()}`;
  await page.getByTestId("notes-input").fill(note);
  await page.getByTestId("notes-save").click();

  const db = adminClient();
  await expect
    .poll(async () =>
      (await db.from("orders").select("internal_notes").eq("id", seeded.orderId).single())
        .data?.internal_notes
    )
    .toBe(note);
  await page.reload();
  await expect(page.getByTestId("notes-input")).toHaveValue(note);
});

test("AC5: config code link opens the configurator on that design", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const link = page.getByTestId("config-code-link").first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/configurator\?design=/);
  if (seeded.designSlug) {
    await expect(page).toHaveURL(new RegExp(`design=${seeded.designSlug}`));
  }
});

test("AC6 (mobile): order card shown, no horizontal overflow", async ({ page }, t) => {
  test.skip(t.project.name !== "mobile", "mobile-only");
  await loginAdmin(page);
  await page.getByTestId("filter-q").fill(seeded.code);
  await page.getByTestId("filter-submit").click();
  await expect(seededRow(page, t)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
