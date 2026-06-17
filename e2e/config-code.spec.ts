import { test, expect } from "@playwright/test";
import { adminClient, firstActiveDesign, horizontalOverflow } from "./helpers";

/**
 * Journey 2 — Codice di configurazione (salva / ricarica / condividi).
 * ACCEPTANCE.md §2 · ADR 0011. Resilient: usa i design del catalogo vivo.
 */

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function twoActiveDesignSlugs(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("slug")
    .eq("active", true)
    .order("sort_order")
    .limit(2);
  if (error) throw error;
  return (data ?? []).map((d) => d.slug as string);
}

test("AC1: the code reflects the design and starts with MK-", async ({ page }) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await expect(page.getByTestId("config-code-bar")).toBeVisible();
  await expect(page.getByTestId("config-code")).toHaveText(/^MK-[A-Z2-9]+(-[A-Z2-9]+)*$/);
});

test("AC2: copy code → switch design → paste → identical reconstruction", async ({
  page,
}) => {
  const [a, b] = await twoActiveDesignSlugs();
  test.skip(!a || !b, "needs at least two active designs");

  await page.goto(`/no/configurator?design=${a}&step=2`);
  await page.getByTestId("details-step").getByRole("radio").first().click();
  await expect(page).toHaveURL(/opt_/);
  const code = await page.getByTestId("config-code").innerText();

  await page.goto(`/no/configurator?design=${b}&step=2`);
  await expect(page.getByTestId("config-code")).not.toHaveText(code);

  await page.getByTestId("paste-input").fill(code);
  await page.getByTestId("paste-apply").click();
  await expect(page).toHaveURL(new RegExp(`design=${a}`));
  await expect(page.getByTestId("config-code")).toHaveText(code);
});

test("AC3: copy buttons write code + link to the clipboard", async ({ page }) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);

  await page.getByTestId("copy-code").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^MK-/);

  await page.getByTestId("copy-link").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/configurator");
  expect(link).toContain("design=");
});

test("AC4: an invalid code shows a gentle error, no crash", async ({ page }) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await page.getByTestId("paste-input").fill("MK-ZZZ-9-9");
  await page.getByTestId("paste-apply").click();
  await expect(page.getByTestId("paste-error")).toBeVisible();
  await expect(page.getByTestId("config-code")).toBeVisible(); // page alive
});

test("AC5: a deep link reconstructs the configuration", async ({ page }) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await page.getByTestId("details-step").getByRole("radio").first().click();
  await expect(page).toHaveURL(/opt_/);
  const code = await page.getByTestId("config-code").innerText();
  const url = page.url();

  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByTestId("config-code")).toHaveText(code);
});

test("AC5 (mobile): code bar usable, no overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await expect(page.getByTestId("config-code-bar")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
