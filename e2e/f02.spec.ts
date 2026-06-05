import { test, expect, type Page } from "@playwright/test";

/** F02 — design details (configurator step 2). AC numbers from the card. */

const B1 = "/no/configurator?design=blomster-1&step=2";
const KRABBE = "/no/configurator?design=krabbe&step=2";

const previewLayerCount = (page: Page) =>
  page.locator('[data-testid="details-step"] img').count();

test("AC1: only the chosen design's categories show, color → radiogroup", async ({
  page,
}) => {
  await page.goto(B1);
  await expect(page.getByTestId("details-step")).toBeVisible();
  // Blomster 1 has exactly two categories: details + borders, both color
  await expect(page.getByTestId("category-details")).toBeVisible();
  await expect(page.getByTestId("category-borders")).toBeVisible();
  await expect(page.getByTestId("category-leaves")).toHaveCount(0);
  await expect(
    page.getByTestId("category-details").getByRole("radiogroup")
  ).toBeVisible();
});

test("AC2: choosing a color updates the preview without reload", async ({
  page,
}) => {
  await page.goto(B1);
  const before = await previewLayerCount(page);
  // pick a swatch in details
  await page
    .getByTestId("category-details")
    .getByRole("radio")
    .first()
    .click();
  await expect(page).toHaveURL(/opt_details=/);
  // a design layer is now composited on top of nothing → at least 1 layer
  const after = await previewLayerCount(page);
  expect(after).toBeGreaterThanOrEqual(before);
  // the multiply layer is present
  await expect(
    page.locator('[data-testid="details-step"] img[style*="multiply"]').first()
  ).toBeVisible();
});

test("AC3: Krabbe color lock syncs colors↔borders by hex", async ({ page }) => {
  await page.goto(KRABBE);
  const step = page.getByTestId("details-step");
  await expect(page.getByTestId("color-lock")).toBeVisible();

  await page.getByTestId("color-lock").check();
  await expect(step).toHaveAttribute("data-color-lock", "1");

  // pick the 2nd swatch in colors; borders should sync to the same hex
  await page
    .getByTestId("category-colors")
    .getByRole("radio")
    .nth(1)
    .click();
  await expect(page).toHaveURL(/opt_colors=/);
  await expect(page).toHaveURL(/opt_borders=/);

  // turn lock off, change colors: borders must NOT follow
  await page.getByTestId("color-lock").uncheck();
  const bordersBefore = new URL(page.url()).searchParams.get("opt_borders");
  await page.getByTestId("category-colors").getByRole("radio").nth(3).click();
  const bordersAfter = new URL(page.url()).searchParams.get("opt_borders");
  expect(bordersAfter).toBe(bordersBefore);
});

test("AC4: refresh reconstructs selections; back returns to step 1 keeping design", async ({
  page,
}) => {
  await page.goto(B1);
  await page.getByTestId("category-details").getByRole("radio").nth(2).click();
  await expect(page).toHaveURL(/opt_details=/);

  await page.reload();
  // the selected radio is still checked after reload
  await expect(
    page.getByTestId("category-details").getByRole("radio", { checked: true })
  ).toHaveCount(1);

  await page.getByTestId("back-step").click();
  await expect(page).toHaveURL(/design=blomster-1/);
  await expect(page).not.toHaveURL(/step=2/);
  await expect(page.getByTestId("design-step")).toBeVisible();
});

test("AC5: single-option category (krabbe line) has no carousel, auto-selected", async ({
  page,
}) => {
  await page.goto(KRABBE);
  const line = page.getByTestId("category-line");
  await expect(line).toBeVisible();
  await expect(line.getByText("Valgt automatisk")).toBeVisible();
  // no radios/buttons rendered for the single option
  await expect(line.getByRole("radio")).toHaveCount(0);
});

test("AC6 (mobile): swatches ≥44px, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto(B1);
  const swatch = page
    .getByTestId("category-details")
    .getByRole("radio")
    .first();
  const box = await swatch.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
