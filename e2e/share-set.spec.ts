import { test, expect, type Browser, type Page } from "@playwright/test";
import { designWithCode } from "./helpers";

/**
 * Journey 8 — Share your set (CA-3). ACCEPTANCE.md §8 · ADR 0016.
 * Desktop-only by policy (i due flussi di dominio; parser/cap/clamp sono unit).
 * Resilient: design con codice (righe condivisibili) + prodotti scoperti a runtime.
 * NB: il codice di riga vive nel dettaglio ESPANSO (`cart-line-detail`), non nella
 * riga collassata — si legge solo dopo `cart-expand`.
 */

let step3 = "";
test.beforeAll(async () => {
  const design = await designWithCode();
  step3 = `/no/configurator?design=${design.slug}&step=3`;
});

const ceramics = (page: Page) =>
  page.getByTestId("ceramics-step").getByRole("radio");

async function addNthCeramic(page: Page, n: number) {
  await ceramics(page).nth(n).click();
  await page.getByTestId("add-to-cart").click();
}

/** Compose a 2-row basket in a throwaway context and return its share link. */
async function forgeShareUrl(browser: Browser) {
  const ctx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  await page.goto(step3);
  await page.getByTestId("ceramics-step").waitFor();
  await addNthCeramic(page, 0);
  await addNthCeramic(page, 1);

  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(2);
  const total = await panel.getByTestId("docked-total").innerText();

  await panel.getByTestId("share-set").click();
  const link = panel.getByTestId("share-feedback").locator("code");
  await expect(link).toBeVisible();
  const url = await link.innerText();
  await ctx.close();
  return { url, total };
}

test("AC1/AC2/AC5: share 2 rows → clean context lands at step 3 → expand → edit", async ({
  browser,
}) => {
  const { url, total } = await forgeShareUrl(browser);

  // AC1: link carries only codes/slugs/qty — no prices, no internal ids
  expect(url).toContain("step=3");
  expect(url).toMatch(/set=MK-/);
  expect(url).not.toMatch(/price|cents|[0-9a-f]{8}-[0-9a-f]{4}/i);

  // AC2: a clean browser context lands with the set loaded, live-repriced
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  await page.getByTestId("ceramics-step").waitFor();

  const banner = page.getByTestId("shared-set-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId("shared-set-loaded-text")).toBeVisible();

  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(2);
  await expect(panel.getByTestId("docked-total")).toHaveText(total);
  await expect(page).not.toHaveURL(/set=/);

  // AC5: expand the first row → big composition + the row's config code + edit
  await panel.getByTestId("cart-expand").first().click();
  const detail = panel.getByTestId("cart-line-detail");
  await expect(detail).toBeVisible();
  await expect(panel.getByTestId("cart-expand").first()).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(await detail.locator("img").count()).toBeGreaterThan(0);

  await detail.getByTestId("cart-edit-design").click();
  await page.getByTestId("details-step").waitFor();
  // R3-D: the code bar is gone — the round-trip is verified via the URL the
  // ?code= decode rebuilds (design slug + opt_ params), not a rendered code.
  await expect(page).toHaveURL(/[?&]design=/);
  await expect(page).toHaveURL(/opt_/);
  await ctx.close();
});

test("AC3: non-empty basket → 3-way banner; Add merges; set= consumed; no banner on refresh", async ({
  browser,
}) => {
  const { url } = await forgeShareUrl(browser);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(step3);
  await page.getByTestId("ceramics-step").waitFor();
  test.skip((await ceramics(page).count()) < 3, "needs ≥3 ceramics for a distinct preexisting row");

  await addNthCeramic(page, 2); // a row NOT in the shared set
  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(1);

  // landing shows the 3-way choice and applies NOTHING until chosen
  await page.goto(url);
  await page.getByTestId("ceramics-step").waitFor();
  const banner = page.getByTestId("shared-set-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId("shared-set-choice-text")).toBeVisible();
  await expect(panel.getByTestId("cart-line")).toHaveCount(1);
  await expect(page).toHaveURL(/set=/);

  await banner.getByTestId("shared-set-add").click();
  await expect(panel.getByTestId("cart-line")).toHaveCount(3);
  await expect(page).not.toHaveURL(/set=/);

  // refresh → set NOT re-proposed (consumed), basket intact
  await page.reload();
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByTestId("shared-set-banner")).toHaveCount(0);
  await expect(panel.getByTestId("cart-line")).toHaveCount(3);
  await ctx.close();
});
