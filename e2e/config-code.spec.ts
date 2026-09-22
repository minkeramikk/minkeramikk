import { test, expect } from "@playwright/test";
import { designWithCode, addFirstCeramic } from "./helpers";

/**
 * Journey 2 — config code DECODE (ADR 0011). R3-D removed the "YOUR DESIGN
 * CODE" bar from the configurator; the encode/copy/paste UI is gone, but the
 * `?code=` deep-link decode stays. R5-POLISH-STEP23 took the drawer's code
 * foot out too (TL: the drawer IS the step-3 basket, and that one never had
 * it), so the code is no longer rendered anywhere in the configurator — this
 * reads it off the cart a real add-to-basket wrote, and still asserts the
 * deep link reconstructs the configuration. The affordance is gone, the
 * contract it used to prove is not. Encode/decode units live in
 * src/lib/configurator/config-code.test.ts.
 */

test("AC5: a ?code= deep link reconstructs the configuration on step 2", async ({
  page,
}) => {
  const design = await designWithCode();

  // Build a cart line so a real config code is rendered in the recap.
  await page.goto(`/no/configurator?design=${design.slug}&step=3`);
  await addFirstCeramic(page);

  // R5-POLISH-STEP23: no UI renders the code any more, so take it from the
  // cart the add above actually wrote (`mk-cart-v1`, use-cart.ts) — the same
  // string the removed «Copy code» button used to put on the clipboard.
  const code = await page.evaluate(() => {
    const raw = window.localStorage.getItem("mk-cart-v1");
    const lines = raw ? (JSON.parse(raw) as { configCode?: string }[]) : [];
    return lines.find((l) => l.configCode)?.configCode ?? "";
  });
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
  // POLLED, not read once: dropping the param is a `router.replace` that lands
  // AFTER the step is on screen, so a single read raced it and this test failed
  // roughly one run in two — in both directions, alone and in the full gate.
  await expect.poll(() => page.url()).not.toContain("code=MK-ZZZ");
});
