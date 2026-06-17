import { test, expect } from "@playwright/test";
import { HAS_ADMIN, ADMIN_EMAIL, ADMIN_PASSWORD, horizontalOverflow } from "./helpers";

/**
 * Journey 5 — Admin auth & guard. ACCEPTANCE.md §5 (storia F06).
 * I test di guard/errore girano sempre; il flusso login/logout si auto-skippa
 * senza ADMIN_EMAIL/ADMIN_PASSWORD.
 */

test("AC2: anon on /admin is redirected to login, no dashboard served", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("logout")).toHaveCount(0);
});

test("AC2: anon on a deeper /admin/* page is redirected to login", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("AC2: a direct fetch of /admin (no cookies) 307s to login, no admin HTML", async ({
  request,
}) => {
  const res = await request.get("/admin", { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/admin/login");
});

test("AC3: wrong credentials show a generic error and stay on login", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill("nobody@example.com");
  await page.getByTestId("login-password").fill("definitely-wrong");
  await page.getByTestId("login-submit").click();

  await expect(page.getByTestId("login-error")).toBeVisible();
  await expect(page.getByTestId("login-error")).toHaveText(/invalid email or password/i);
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("AC1: login → dashboard, persists on reload, logout returns to login", async ({
  page,
}) => {
  test.skip(!HAS_ADMIN, "needs ADMIN_EMAIL/ADMIN_PASSWORD (seeded admin)");

  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("logout")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("logout")).toBeVisible();

  // authenticated visiting /admin/login bounces back to the dashboard
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("AC4 (mobile): login page usable, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto("/admin/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
