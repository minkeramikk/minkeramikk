import { test, expect, type Page } from "@playwright/test";

/** F14 — continuous empty-state: preview always composed, invisible step transition. */

const previewImgs = (page: Page) =>
  page.locator('[data-testid="preview-canvas"] img');

test("AC1: SSR first paint is the composed default plate (no blank/skeleton)", async ({
  page,
}) => {
  // the server-rendered HTML already contains the composed default layers
  const res = await page.request.get("/no/configurator");
  const html = await res.text();
  expect(html).toMatch(/designs\/blomster-1\/[^"]+\.png/); // composed, not bare
  expect(html).not.toContain('data-testid="preview-skeleton"');

  // and at first commit the preview is painted, skeleton absent
  await page.goto("/no/configurator", { waitUntil: "commit" });
  await expect(previewImgs(page).first()).toBeAttached();
  await expect(page.getByTestId("preview-skeleton")).toHaveCount(0);
});

test("AC2: step1 → step2 keeps the preview pixel-identical", async ({ page }) => {
  // tall viewport so neither step scrolls — a scrollbar appearing on only one
  // step would change the 1-col preview width and is not a real preview change
  const w = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width: w, height: 1600 });

  await page.goto("/no/configurator");
  const canvas = page.getByTestId("preview-canvas");
  await expect(previewImgs(page).first()).toBeVisible();
  await page.waitForTimeout(300); // settle
  const before = await canvas.screenshot();

  await page.getByTestId("next-step").click(); // → step 2
  await expect(page.getByTestId("details-step")).toBeVisible();
  await page.waitForTimeout(300);
  const after = await canvas.screenshot();

  expect(Buffer.compare(before, after)).toBe(0); // identical
});

test("AC3: changing design never leaves a blank preview (old stays until new loads)", async ({
  page,
}) => {
  await page.goto("/no/configurator");
  await expect(previewImgs(page).first()).toBeVisible();

  // click a different design and poll the preview during the transition:
  // there must ALWAYS be at least one layer image painted (no white flash)
  await page
    .getByTestId("design-step")
    .getByRole("button", { name: /Krabbe/ })
    .click();

  for (let i = 0; i < 12; i++) {
    expect(await previewImgs(page).count()).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(20);
  }
  await expect(page).toHaveURL(/design=krabbe/);

  // once settled, the preview must show ONLY the new design's layers — no
  // stale layers from the previous design left stacked underneath (the F14 bug)
  await page.waitForTimeout(400);
  const srcs = await previewImgs(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute("src") ?? "")
  );
  expect(srcs.length).toBeGreaterThan(0);
  for (const src of srcs) {
    expect(src).toContain("/designs/krabbe/");
  }
});

test("AC4: prefers-reduced-motion swaps immediately, still no blank", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/no/configurator");
  await expect(previewImgs(page).first()).toBeVisible();

  await page
    .getByTestId("design-step")
    .getByRole("button", { name: /Striper/ })
    .click();
  // no cross-fade overlay should linger; a layer is always present
  expect(await previewImgs(page).count()).toBeGreaterThanOrEqual(1);
  await expect(page).toHaveURL(/design=striper/);
  await context.close();
});
