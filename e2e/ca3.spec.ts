import { test, expect, type Browser, type Page } from "@playwright/test";

/** CA-3 — "Share your set": shareable basket link + expandable cart rows.
 *  Desktop-only by the 2026-06-12 test policy: the two domain flows live here,
 *  everything else (parser degradation, cap, clamp) is unit-tested in
 *  src/lib/cart/set-code.test.ts. */

const STEP3 = "/no/configurator?design=blomster-1&step=3";

async function addProduct(page: Page, slug: string) {
  await page.getByTestId(`product-${slug}`).click();
  await page.getByTestId("add-to-cart").click();
}

/** Compose a 2-row basket in a throwaway context and return its share link. */
async function forgeShareUrl(browser: Browser) {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  await page.goto(STEP3);
  await page.getByTestId("ceramics-step").waitFor();
  await addProduct(page, "vietri-flat");
  await addProduct(page, "vietri-dyp");

  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(2);
  const total = await panel.getByTestId("docked-total").innerText();
  const firstCode = await panel
    .getByTestId("cart-line")
    .first()
    .locator("code")
    .first()
    .innerText();

  await panel.getByTestId("share-set").click();
  const link = panel.getByTestId("share-feedback").locator("code");
  await expect(link).toBeVisible();
  const url = await link.innerText();
  await ctx.close();
  return { url, total, firstCode };
}

test("happy path round-trip: share 2 rows → clean context lands at step 3 → expand → edit design", async ({
  browser,
}) => {
  const { url, total, firstCode } = await forgeShareUrl(browser);

  // AC1: the link carries only codes/slugs/qty — no prices, no internal ids
  expect(url).toContain("step=3");
  expect(url).toMatch(/set=MK-/);
  expect(url).not.toMatch(/price|cents|[0-9a-f]{8}-[0-9a-f]{4}/i);

  // AC2: a clean browser context (empty basket) lands with the set loaded
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  await page.getByTestId("ceramics-step").waitFor();

  const banner = page.getByTestId("shared-set-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId("shared-set-loaded-text")).toBeVisible();

  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(2);
  // live re-price from the catalog = same total as the sharer saw
  await expect(panel.getByTestId("docked-total")).toHaveText(total);
  // `set=` consumed once (decode-once, like ?code=)
  await expect(page).not.toHaveURL(/set=/);

  // AC5: expand the first row → big composition + readable selections + edit
  await panel.getByTestId("cart-expand").first().click();
  const detail = panel.getByTestId("cart-line-detail");
  await expect(detail).toBeVisible();
  await expect(
    panel.getByTestId("cart-expand").first()
  ).toHaveAttribute("aria-expanded", "true");
  expect(await detail.locator("img").count()).toBeGreaterThan(0);

  await detail.getByTestId("cart-edit-design").click();
  await page.getByTestId("details-step").waitFor();
  // the ?code= deep link reloads that exact configuration (F19 semantics)
  await expect(page.getByTestId("config-code")).toHaveText(firstCode);
  await ctx.close();
});

test("3-way banner: non-empty basket → Add merges to 3 rows; set= consumed, no banner on refresh", async ({
  browser,
}) => {
  const { url } = await forgeShareUrl(browser);

  // context with 1 PREEXISTING row (a ceramic not in the shared set)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(STEP3);
  await page.getByTestId("ceramics-step").waitFor();
  await addProduct(page, "vietri-asjett");
  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(1);

  // AC3: landing shows the 3-way choice and applies NOTHING until chosen
  await page.goto(url);
  await page.getByTestId("ceramics-step").waitFor();
  const banner = page.getByTestId("shared-set-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId("shared-set-choice-text")).toBeVisible();
  await expect(panel.getByTestId("cart-line")).toHaveCount(1);
  await expect(page).toHaveURL(/set=/); // not consumed before the choice

  await banner.getByTestId("shared-set-add").click();
  await expect(panel.getByTestId("cart-line")).toHaveCount(3);
  await expect(page).not.toHaveURL(/set=/);

  // refresh → the set is NOT re-proposed (consumed), basket intact
  await page.reload();
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByTestId("shared-set-banner")).toHaveCount(0);
  await expect(panel.getByTestId("cart-line")).toHaveCount(3);
  await ctx.close();
});
