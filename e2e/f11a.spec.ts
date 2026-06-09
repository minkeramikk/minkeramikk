import { test, expect, type Page } from "@playwright/test";
import { adminClient, loadEnvLocal } from "./helpers";

/** F11a — theme editor (/admin/theme). Needs a seeded admin + the service role
 *  (to restore the shared `settings` row); skips when absent, like F06/F07. */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasService = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
);
const ready = Boolean(EMAIL && PASSWORD) && hasService;

const DEFAULT = { light: "#fbe9e4", dark: "#2b2330", accent: "#7d4f9c" };

test.afterEach(async () => {
  if (!ready) return;
  // never leave the (shared) public theme re-coloured by a test
  await adminClient()
    .from("settings")
    .update({
      color_light: DEFAULT.light,
      color_dark: DEFAULT.dark,
      color_accent: DEFAULT.accent,
    })
    .eq("id", 1);
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("AC1: saving a valid theme re-themes the public site (CSS var)", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/theme");
  await expect(page.getByTestId("theme-editor")).toBeVisible();

  const NEW = "#6a3fa0"; // darker accent — still passes AA
  await page.getByTestId("picker-accent").fill(NEW);
  await expect(page.getByTestId("theme-save")).toBeEnabled();
  await page.getByTestId("theme-save").click();
  await expect(page.getByTestId("save-ok")).toBeVisible();

  await page.goto("/no");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--mk-accent")
      .trim()
      .toLowerCase()
  );
  expect(accent).toBe(NEW);
});

test("AC2: a below-AA theme is blocked with an explanation", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/theme");

  await page.getByTestId("picker-accent").fill("#cbb3df"); // too light for white text
  await expect(page.getByTestId("aa-accent")).toHaveAttribute("data-pass", "false");
  await expect(page.getByTestId("aa-hint")).toBeVisible();
  await expect(page.getByTestId("theme-save")).toBeDisabled();
});

test("AC1: reset returns the pickers to the defaults", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/theme");

  await page.getByTestId("picker-accent").fill("#000000");
  await page.getByTestId("theme-reset").click();
  await expect(page.getByTestId("picker-accent")).toHaveValue(DEFAULT.accent);
  await expect(page.getByTestId("aa-status")).toHaveAttribute("data-ok", "true");
});

test("AC3 (mobile): editor usable, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(!ready, "needs admin creds + service role");
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await login(page);
  await page.goto("/admin/theme");
  await expect(page.getByTestId("theme-editor")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
