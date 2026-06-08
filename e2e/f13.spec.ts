import { test, expect, devices } from "@playwright/test";

/** F13 — step 2 original style: hover preview, keyboard, recompose.
 *  NOTE: F15 (ADR 0012) supersedes F13's procedural swatch and masked icon with
 *  the REAL original assets. AC1/AC2 below assert the F15 reality; the hover
 *  preview / keyboard / recompose behaviour from F13 is unchanged. */

const B1 = "/no/configurator?design=blomster-1&step=2";
const AMALFI = "/no/configurator?design=amalfi-dyr&step=2";

test("AC1 (F15): swatches show the real glaze photo, not a flat disc", async ({
  page,
}) => {
  await page.goto(B1);
  const swatch = page
    .getByTestId("category-details")
    .getByRole("radio")
    .first();
  await expect(swatch).toBeVisible();
  // the real swatch asset (options.image) is rendered inside the swatch
  const photo = swatch.getByTestId("swatch-photo");
  await expect(photo).toHaveAttribute("src", /swatches\/.+\.png/);
});

test("AC2 (F15): kind=image icons show the original art (no mask/currentColor)", async ({
  page,
}) => {
  await page.goto(AMALFI);
  const icon = page.getByTestId("option-icon").first();
  await expect(icon).toBeVisible();
  // the tile contains a real <img> of the curated art, not a masked silhouette
  const img = icon.locator("img");
  await expect(img).toHaveAttribute("src", /animal\/.+\.png/);
  const mask = await icon.evaluate(
    (el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage
  );
  expect(mask === "none" || mask === "" || mask == null).toBeTruthy();
});

test("AC3: hover shows the pattern preview popup; Esc closes it", async ({
  page,
}) => {
  await page.goto(B1);
  const swatch = page
    .getByTestId("category-details")
    .getByRole("radio")
    .nth(2);
  await swatch.hover();
  const popup = page.getByTestId("swatch-preview");
  await expect(popup).toBeVisible();
  await expect(popup.locator("img")).toHaveAttribute("src", /designs\/.+\.png/);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
});

test("AC3: no layout shift — opening the popup doesn't move the swatches", async ({
  page,
}) => {
  await page.goto(B1);
  const group = page.getByTestId("category-details");
  const swatch = group.getByRole("radio").nth(2);
  const before = await group.boundingBox();
  await swatch.hover();
  await expect(page.getByTestId("swatch-preview")).toBeVisible();
  const after = await group.boundingBox();
  expect(after).toEqual(before); // popup is in a portal → no reflow
});

test("AC4: click recomposes the main preview (multiply)", async ({ page }) => {
  await page.goto(B1);
  await page
    .getByTestId("category-details")
    .getByRole("radio")
    .nth(3)
    .click();
  await expect(page).toHaveURL(/opt_details=/);
  await expect(
    page.locator('[data-testid="preview-canvas"] img[style*="multiply"]').first()
  ).toBeVisible();
});

test("AC6: arrow keys move + select within the radiogroup", async ({ page }) => {
  await page.goto(B1);
  const group = page.getByTestId("category-details");
  const radios = group.getByRole("radio");
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  // selection follows focus → 2nd swatch becomes checked, URL updated
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(/opt_details=/);
});

test("AC5 (mobile): no hover popup; tap selects and updates the main preview", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "runs once, on the mobile project");
  // a REAL touch device (no hover, coarse pointer) so the desktop-only popup
  // is suppressed and .tap() works
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await context.newPage();
  await page.goto(B1);
  const swatch = page
    .getByTestId("category-details")
    .getByRole("radio")
    .nth(2);
  await swatch.tap();
  await expect(page.getByTestId("swatch-preview")).toHaveCount(0); // no hover popup
  await expect(page).toHaveURL(/opt_details=/); // tap selected it
  await expect(
    page.locator('[data-testid="preview-canvas"] img[style*="multiply"]').first()
  ).toBeVisible();
  await context.close();
});
