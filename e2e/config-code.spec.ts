import { test, expect } from "@playwright/test";
import { designWithCode, addFirstCeramic } from "./helpers";

/**
 * Journey 2 — config code DECODE (ADR 0011). R3-D removed the "YOUR DESIGN
 * CODE" bar from the configurator; the encode/copy/paste UI is gone, but the
 * `?code=` deep-link decode stays. The code is now surfaced only on the cart
 * recap (CartLineRecap), so we read it there and assert the deep link
 * reconstructs the configuration. Encode/decode units live in
 * src/lib/configurator/config-code.test.ts.
 */

test("AC5: a ?code= deep link reconstructs the configuration on step 2", async ({
  page,
}) => {
  const design = await designWithCode();

  // Build a cart line so a real config code is rendered in the recap.
  await page.goto(`/no/configurator?design=${design.slug}&step=3`);
  await addFirstCeramic(page);

  const line = page.getByTestId("docked-cart-panel").getByTestId("cart-line").first();
  await line.getByTestId("cart-expand").click();
  const code = (await line.locator("code").first().innerText()).trim();
  expect(code).toMatch(/^MK-/);

  // The deep link alone (clean navigation) must rebuild design + options.
  await page.goto("about:blank");
  await page.goto(`/no/configurator?code=${encodeURIComponent(code)}&step=2`);
  await expect(page.getByTestId("details-step")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`design=${design.slug}`));
  await expect(page).toHaveURL(/opt_/);
});

test("AC4: an invalid ?code= drops the param without crashing", async ({ page }) => {
  const design = await designWithCode();
  await page.goto(`/no/configurator?code=MK-ZZZ-9-9&design=${design.slug}&step=2`);
  // page alive, fell back to the design, bad code dropped from the URL
  await expect(page.getByTestId("details-step")).toBeVisible();
  await expect(page).toHaveURL(/step=2/);
  expect(page.url()).not.toContain("code=MK-ZZZ");
});
