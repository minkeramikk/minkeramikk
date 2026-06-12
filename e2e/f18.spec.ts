import { test, expect } from "@playwright/test";

/** F18 — clickable stepper (+ CA-2: Next/Back moved in-flow at the end of the
 *  options column — the sticky mobile bar and the top-cluster buttons are gone
 *  on steps 1–2). Pure front-end; 390 + 1280. */

const STEP2 = "/no/configurator?design=blomster-1&step=2";

async function selectAnOption(page: import("@playwright/test").Page) {
  await page.getByTestId("details-step").waitFor();
  await page
    .getByTestId("details-step")
    .getByRole("radiogroup")
    .first()
    .getByRole("radio")
    .nth(2)
    .click();
  await expect(page).toHaveURL(/opt_/);
  return new URL(page.url()).search.match(/opt_[^&=]+=[^&]+/)![0];
}

test("stepper jumps keep the design + option config; active has aria-current", async ({
  page,
}) => {
  await page.goto(STEP2);
  await expect(page.getByTestId("step-2")).toHaveAttribute("aria-current", "step");
  const opt = await selectAnOption(page);

  // jump back to step 1 → design + opt_ preserved, step dropped
  await page.getByTestId("step-1").click();
  await expect(page).toHaveURL(/design=blomster-1/);
  await expect(page).toHaveURL(new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(page).not.toHaveURL(/step=/);

  // jump forward to step 3 → step=3, config preserved
  await page.getByTestId("step-3").click();
  await expect(page).toHaveURL(/step=3/);
  await expect(page).toHaveURL(new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("CA-2: Next/Back are in-flow at the END of the options column (single instance, both viewports)", async ({
  page,
}) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  // the mobile sticky bar is gone on steps 1–2
  await expect(page.getByTestId("step-nav-mobile")).toHaveCount(0);
  // one instance of each CTA serves every viewport
  await expect(page.getByTestId("next-step")).toHaveCount(1);
  await expect(page.getByTestId("back-step")).toHaveCount(1);
  // the nav block is the LAST element of the options column (natural tab order)
  const isLast = await page
    .getByTestId("step-nav-flow")
    .evaluate((el) => el === el.parentElement!.lastElementChild);
  expect(isLast).toBe(true);
  // reached at the end of the scroll, then usable
  await page.getByTestId("next-step").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("next-step")).toBeInViewport();
  await expect(page.getByTestId("back-step")).toBeInViewport();
});

test("CA-2 layout: nothing fixed/sticky pinned to the bottom viewport; stepper-only cluster stays on top", async ({
  page,
}) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  // the CTA has no fixed/sticky ancestor — it scrolls with the content
  const pinned = await page.getByTestId("next-step").evaluate((el) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed" || pos === "sticky") return pos;
    }
    return "none";
  });
  expect(pinned).toBe("none");
  // top cluster (stepper only) above the preview grid (F18/F21 unchanged)
  const nav = (await page.getByTestId("step-nav").boundingBox())!;
  const preview = (await page.getByTestId("preview-canvas").boundingBox())!;
  expect(nav.y).toBeLessThan(preview.y);
});

test("Next/Back have ≥44px touch targets", async ({ page }) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  for (const id of ["next-step", "back-step", "step-2"]) {
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("stepper is keyboard-operable", async ({ page }) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  await page.getByTestId("step-3").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/step=3/);
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
});

test("step 3 stepper jumps back to the configurator", async ({ page }) => {
  await page.goto("/no/configurator?design=blomster-1&step=3");
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("step-2").click();
  await expect(page).toHaveURL(/step=2/);
  await expect(page.getByTestId("details-step")).toBeVisible();
});
