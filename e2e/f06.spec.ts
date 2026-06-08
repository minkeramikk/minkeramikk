import { test, expect } from "@playwright/test";
import { loadEnvLocal } from "./helpers";

/** F06 — back-office login + AdminShell + auth guard.
 *  Guard/error tests run always; the login/logout flow needs a seeded admin
 *  (ADMIN_EMAIL/ADMIN_PASSWORD) and is skipped when absent (like RLS tests in CI). */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasAdmin = Boolean(EMAIL && PASSWORD);

test("AC2: anon hitting /admin is redirected to login, no dashboard served", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  // the protected dashboard content is not present
  await expect(page.getByTestId("logout")).toHaveCount(0);
});

test("AC2: anon hitting a deeper /admin/* page is redirected to login", async ({
  page,
}) => {
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

test("AC1/AC3: login → dashboard, persists on reload, logout returns to login", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs ADMIN_EMAIL/ADMIN_PASSWORD (seeded admin)");

  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();

  // landed in the admin area
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("logout")).toBeVisible();

  // session persists across a refresh
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("logout")).toBeVisible();

  // authenticated visiting /admin/login bounces back to the dashboard
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/);

  // logout ends the session
  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  // and the area is protected again
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("AC4 (mobile): login page usable, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto("/admin/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
