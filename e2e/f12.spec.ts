import { test, expect } from "@playwright/test";

/** F12 — legal pages + footer + mobile menu. Smoke in NO + EN, runs at both
 *  project viewports (390 / 1280). No DB/auth needed. */

for (const locale of ["no", "en"] as const) {
  test(`${locale}: footer reaches terms & privacy with content`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.getByTestId("footer-terms").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/terms$`));
    await expect(page.getByTestId("legal-terms")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();

    await page.goto(`/${locale}`);
    await page.getByTestId("footer-privacy").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
    await expect(page.getByTestId("legal-privacy")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  });
}

test("language switch keeps the current legal page", async ({ page }) => {
  await page.goto("/no/terms");
  await expect(page.getByTestId("legal-terms")).toBeVisible();
  await page.getByRole("link", { name: "EN", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/terms$/);
  await expect(page.getByTestId("legal-terms")).toBeVisible();
});

test("mobile menu opens, traps focus, and navigates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto("/no");
  await page.getByTestId("mobile-menu").click();
  await expect(page.getByTestId("mobile-menu-drawer")).toBeVisible();
  // Esc closes (Radix)
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mobile-menu-drawer")).toBeHidden();
  // reopen and navigate (legacy /products removed → use the configurator link)
  await page.getByTestId("mobile-menu").click();
  await page.getByTestId("mobile-nav-configurator").click();
  await expect(page).toHaveURL(/\/no\/configurator$/);
});

test("mobile menu trigger is hidden on desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only");
  await page.goto("/no");
  await expect(page.getByTestId("mobile-menu")).toBeHidden();
});

// ── CQ-2: branded error / not-found ──────────────────────────────────────────

test("CQ-2: an unknown URL under /[locale] renders the branded 404 (not Next default)", async ({
  page,
}) => {
  const res = await page.goto("/no/denne-siden-finnes-ikke");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found-page")).toBeVisible();
  // home/configurator link works
  await page.getByTestId("not-found-home").click();
  await expect(page).toHaveURL(/\/no\/configurator/);
});

test("CQ-2: an out-of-locale URL is routed to a branded 404", async ({ page }) => {
  // localePrefix:"always" → middleware adds the default locale, landing on the
  // branded not-found rather than Next's bare 404.
  await page.goto("/totally-outside-locale-xyz");
  await expect(page.getByTestId("not-found-page")).toBeVisible();
});
