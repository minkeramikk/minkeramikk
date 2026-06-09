import { test, expect } from "@playwright/test";

/** F18 — clickable stepper + sticky Next/Back. Pure front-end; 390 + 1280. */

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

test("Next and Back are reachable without scrolling", async ({ page }, testInfo) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  if (testInfo.project.name === "mobile") {
    // F21: mobile bottom bar holds the buttons
    await expect(page.getByTestId("step-nav-mobile")).toBeVisible();
    await expect(page.getByTestId("next-step-mobile")).toBeInViewport();
    await expect(page.getByTestId("back-step-mobile")).toBeInViewport();
  } else {
    // F21: desktop nav cluster at top
    await expect(page.getByTestId("step-nav")).toBeVisible();
    await expect(page.getByTestId("next-step")).toBeInViewport();
    await expect(page.getByTestId("back-step")).toBeInViewport();
  }
});

test("layout: fixed bottom bar on mobile (F21: cluster at top on desktop)", async ({
  page,
}, testInfo) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  const vp = page.viewportSize()!;
  if (testInfo.project.name === "mobile") {
    const navMobile = (await page.getByTestId("step-nav-mobile").boundingBox())!;
    expect(navMobile.y + navMobile.height).toBeGreaterThanOrEqual(vp.height - 4); // pinned bottom
    expect(navMobile.width).toBeGreaterThanOrEqual(vp.width - 2); // full width
  } else {
    // F21: nav cluster is at the TOP — above the grid, before the preview
    const nav = (await page.getByTestId("step-nav").boundingBox())!;
    const preview = (await page.getByTestId("preview-canvas").boundingBox())!;
    expect(nav.y).toBeLessThan(preview.y); // cluster above the preview grid
  }
});

test("Next/Back have ≥44px touch targets", async ({ page }, testInfo) => {
  await page.goto(STEP2);
  await page.getByTestId("details-step").waitFor();
  if (testInfo.project.name === "mobile") {
    for (const id of ["next-step-mobile", "back-step-mobile", "step-2"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  } else {
    for (const id of ["next-step", "back-step", "step-1"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
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
