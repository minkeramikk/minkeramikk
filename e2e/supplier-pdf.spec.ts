import { test, expect } from "@playwright/test";
import { ADMIN_READY, loginAdmin, seedOrder, deleteOrder, type SeededOrder } from "./helpers";

/**
 * Journey 7 — PDF d'ordine per il fornitore. ACCEPTANCE.md §7 (storia F08 · ADR 0007).
 * Desktop-only (route/PDF, niente assert mobile). Il guard anon→401 gira sempre;
 * download + azioni si auto-skippano senza admin creds + service role.
 */

let seeded: SeededOrder;
test.beforeAll(async () => {
  if (!ADMIN_READY) return;
  seeded = await seedOrder("MK-PDF-E2E");
});
test.afterAll(async () => {
  await deleteOrder(seeded?.orderId ?? "");
});

test("guard: anon GET of the PDF route → 401, no PDF", async ({ request }) => {
  const res = await request.get(
    "/api/admin/orders/11111111-1111-4111-8111-111111111111/pdf?supplier=22222222-2222-4222-8222-222222222222",
    { maxRedirects: 0 }
  );
  expect(res.status()).toBe(401);
});

test("AC1: download returns a per-supplier production-order PDF", async ({ page }) => {
  test.skip(!ADMIN_READY, "needs admin creds + service role");
  await loginAdmin(page);
  const res = await page.request.get(
    `/api/admin/orders/${seeded.orderId}/pdf?supplier=${seeded.supplierId}`
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 4).toString("latin1")).toBe("%PDF");
  expect(body.length).toBeGreaterThan(1000);
});

test("AC1/AC5: detail exposes per-supplier PDF actions; send reports a result", async ({
  page,
}) => {
  test.skip(!ADMIN_READY, "needs admin creds + service role");
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await expect(page.getByTestId("lab-pdf-actions").first()).toBeVisible();
  await expect(page.getByTestId("lab-pdf-download").first()).toHaveAttribute(
    "href",
    new RegExp(`/api/admin/orders/${seeded.orderId}/pdf\\?supplier=`)
  );
  // send → "sent" or a "no email" warning (supplier may have no email)
  await page.getByTestId("lab-pdf-send").first().click();
  await expect(page.getByTestId("lab-pdf-result").first()).toBeVisible();
});
