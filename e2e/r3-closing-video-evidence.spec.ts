import { test, expect } from "@playwright/test";
import { loadEnvLocal } from "./helpers";

/**
 * R3-CLOSING evidence — mobile video (390): select a design → the contextual
 * block appears under its row → the "Velg fargene dine" pill moves to step 2.
 * The .webm lands in test-results/ (copy it into docs/evidence/r3-closing).
 */
loadEnvLocal();
test.use({ viewport: { width: 390, height: 844 }, video: "on" });

test("① mobile 390 — select a design, block appears, next step", async ({ page }) => {
  await page.goto("/no/configurator");
  await page.waitForTimeout(700);
  const card = page.getByTestId("design-step").locator("button[aria-pressed]").nth(1);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("design-context-block")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByTestId("next-step-mobile").click();
  await expect(page).toHaveURL(/step=2/);
  await page.waitForTimeout(1500);
});
