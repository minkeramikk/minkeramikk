import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * PR evidence (not assertions): full-page screenshots of step 1 at the
 * three reference breakpoints, with a design selected.
 */
const OUT = "docs/evidence/f01";

test("capture 390/768/1280 screenshots", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto("/no/configurator?design=blomster-1");
    await page
      .locator('img[alt="Blomster 1"]')
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(800); // image paint
    await page.screenshot({
      path: `${OUT}/f01-${width}.png`,
      fullPage: true,
    });
  }
});

const OUT3 = "docs/evidence/f03";

test("F03: capture 390/768/1280 with a populated cart", async ({ page }) => {
  mkdirSync(OUT3, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1100 : 1000 });
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("qty-inc").click();
    await page.getByTestId("add-to-cart").click();
    await page.getByTestId("product-serveringsfat-stor").click();
    await page.getByTestId("add-to-cart").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT3}/f03-${width}.png`, fullPage: true });
  }
});

const OUT2 = "docs/evidence/f02";

test("F02: capture 390/768/1280 with selections + composed preview", async ({
  page,
}) => {
  mkdirSync(OUT2, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1100 : 1000 });
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    // make a colour choice in each category so the preview composes
    const groups = page.getByTestId("details-step").getByRole("radiogroup");
    const n = await groups.count();
    for (let i = 0; i < n; i++) {
      await groups.nth(i).getByRole("radio").nth(2 + i).click();
    }
    await page.waitForTimeout(900); // layer paint
    await page.screenshot({ path: `${OUT2}/f02-${width}.png`, fullPage: true });
  }
});
