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
