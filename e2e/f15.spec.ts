import { test, expect } from "@playwright/test";

/** F15 — step 2 identical to the original: real assets + vertical wrapping grid
 *  (no carousel/horizontal scroller). ADR 0012. */

const B1 = "/no/configurator?design=blomster-1&step=2";
const AMALFI = "/no/configurator?design=amalfi-dyr&step=2";

test("AC1: every option is shown in a wrapping grid (no horizontal scroller) at 390 & 1280", async ({
  page,
}) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1400 });
    await page.goto(B1);
    const group = page.getByTestId("category-details");
    await expect(group).toBeVisible();

    // all 20 options of the category are present at once (not paginated)
    await expect(group.getByRole("radio")).toHaveCount(20);

    // the grid is not a horizontal scroller, and the page has no x-overflow
    const grid = group.getByTestId("option-grid");
    const noScroller = await grid.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1
    );
    expect(noScroller).toBeTruthy();
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
  }
});

test("AC2: color swatches render the real glaze photo (options.image)", async ({
  page,
}) => {
  await page.goto(B1);
  const photos = page.getByTestId("category-details").getByTestId("swatch-photo");
  // all swatches carry a real /swatches/<hex>.png asset (full coverage)
  await expect(photos.first()).toHaveAttribute("src", /\/swatches\/.+\.png/);
  expect(await photos.count()).toBe(20);
});

test("AC3: animal icons show the original art on a tile (no mask)", async ({
  page,
}) => {
  await page.goto(AMALFI);
  const icon = page.getByTestId("option-icon").first();
  await expect(icon.locator("img")).toHaveAttribute("src", /animal\/.+\.png/);
  const mask = await icon.evaluate(
    (el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage
  );
  expect(mask === "none" || mask === "" || mask == null).toBeTruthy();
});

test("AC1: keyboard navigation within the grid still selects (radiogroup)", async ({
  page,
}) => {
  await page.goto(B1);
  const radios = page.getByTestId("category-details").getByRole("radio");
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(/opt_details=/);
});

test("AC4: selecting a swatch recomposes the main preview (no regression)", async ({
  page,
}) => {
  await page.goto(B1);
  await page.getByTestId("category-details").getByRole("radio").nth(3).click();
  await expect(page).toHaveURL(/opt_details=/);
  await expect(
    page.locator('[data-testid="preview-canvas"] img[style*="multiply"]').first()
  ).toBeVisible();
});

// ── Sticky/collapse preview: keep the design visible while the long list scrolls ──
// Desktop: sticky preview column. Mobile: preview pins to the top + collapses to a
// compact thumbnail. (amalfi-dyr has 5 categories → taller than any viewport.)

async function scrollToBottom(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(350); // settle sticky + collapse transition
}

test("AC5: the preview stays pinned in the viewport after scrolling the options", async ({
  page,
}) => {
  await page.goto(AMALFI);
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  const preview = page.getByTestId("preview-canvas");

  await scrollToBottom(page);

  await expect(preview).toBeInViewport();
  const box = await preview.boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(-2); // not scrolled above the fold
  expect(box!.y).toBeLessThan(vh * 0.5); // pinned to the top region
});

test("AC5 (mobile): live preview present, no flip-flop collapse (QA#3)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only behaviour");
  await page.goto(AMALFI);
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  const sticky = page.getByTestId("preview-sticky");
  await expect(sticky).toBeVisible();
  // QA#3: the IntersectionObserver collapse-to-thumbnail was removed (it
  // flip-flopped at the threshold on mobile). The preview no longer toggles.
  await expect(sticky).not.toHaveAttribute("data-collapsed");
  await expect(page.getByTestId("preview-canvas")).toBeVisible();
});

test("AC5: selecting an option while scrolled updates the still-visible preview", async ({
  page,
}) => {
  await page.goto(AMALFI);
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  await scrollToBottom(page);

  const lastGroup = page.getByRole("radiogroup").last();
  await lastGroup.getByRole("radio").nth(2).click();

  await expect(page).toHaveURL(/opt_/);
  await expect(page.getByTestId("preview-canvas")).toBeInViewport();
});

test("P-4: below-the-fold swatch images lazy-load; the hero preview stays eager", async ({
  page,
}) => {
  await page.goto(B1);
  await page.getByTestId("details-step").waitFor({ state: "visible" });

  // swatch photos defer loading (CLEANUP-fix #4 / P-4)
  const swatch = page.getByTestId("swatch-photo").first();
  await expect(swatch).toHaveAttribute("loading", "lazy");
  await expect(swatch).toHaveAttribute("decoding", "async");

  // the main preview must NOT be lazy — F14 keeps it eager + preloaded.
  const previewImg = page.locator('[data-testid="preview-canvas"] img').first();
  await expect(previewImg).not.toHaveAttribute("loading", "lazy");
});
