import { test, expect } from "@playwright/test";

/** F21 — Configurator UI rework: nav cluster top + step-3 docked cart. */

const DESIGN = "/no/configurator?design=blomster-1";
const STEP = (n: 1 | 2 | 3) => (n === 1 ? DESIGN : `${DESIGN}&step=${n}`);

// ── AC1: Nav cluster at top ──────────────────────────────────────────────────

test("AC1a: nav cluster present at top on step 1 (desktop)", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(1));
  await page.getByTestId("design-step").waitFor();
  const cluster = page.getByTestId("step-nav");
  await expect(cluster).toBeVisible();
  const preview = await page.getByTestId("preview-canvas").boundingBox();
  const nav = await cluster.boundingBox();
  // cluster sits above the preview grid
  expect(nav!.y).toBeLessThan(preview!.y);
});

test("AC1b: nav cluster navigates and preserves config (URL state)", async ({
  page,
}) => {
  await page.goto(STEP(2));
  await page.getByTestId("details-step").waitFor();
  // select an option to get an opt_ in the URL
  await page
    .getByTestId("details-step")
    .getByRole("radiogroup")
    .first()
    .getByRole("radio")
    .nth(1)
    .click();
  await expect(page).toHaveURL(/opt_/);
  const opt = new URL(page.url()).search.match(/opt_[^&=]+=[^&]+/)![0];

  // jump to step 1 via cluster stepper
  await page.getByTestId("step-1").click();
  await expect(page).not.toHaveURL(/step=/);
  await expect(page).toHaveURL(new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // jump to step 3 via cluster stepper
  await page.getByTestId("step-3").click();
  await expect(page).toHaveURL(/step=3/);
  await expect(page).toHaveURL(new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("AC1c: step-3 cluster has no dead 'Next' — discreet new-design secondary instead", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  // QA-fix #2: the disabled forward button is gone (dead UI on the last step)
  await expect(page.getByTestId("next-step")).toHaveCount(0);
  await expect(page.getByTestId("new-design-nav")).toBeEnabled();
  await expect(page.getByTestId("back-step")).toBeEnabled();
});

test("QA-fix #2: add → 'new design' CTA returns to step 1 with config preserved, cart intact", async ({
  page,
}) => {
  // arrive at step 2 and pick an option so the URL carries an opt_
  await page.goto(STEP(2));
  await page.getByTestId("details-step").waitFor();
  await page
    .getByTestId("details-step")
    .getByRole("radiogroup")
    .first()
    .getByRole("radio")
    .nth(1)
    .click();
  await expect(page).toHaveURL(/opt_/);
  const opt = new URL(page.url()).search.match(/opt_[^&=]+=[^&]+/)![0];

  // to step 3 (config preserved), add the selected ceramic to the cart
  await page.getByTestId("step-3").click();
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  // the CTA appears under the add feedback; clicking returns to step 1 (DESIGN)
  const cta = page.getByTestId("new-design-cta");
  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).not.toHaveURL(/step=/); // step 1
  await expect(page).toHaveURL(/design=blomster-1/); // same design, not reset
  await expect(page).toHaveURL(
    new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // options preserved
  );

  // the cart still holds the item just added (persistent, untouched)
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
});

test("AC1d: mobile step 1-2 uses bottom sticky bar (not desktop cluster buttons)", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") return;
  await page.goto(STEP(2));
  await page.getByTestId("details-step").waitFor();
  const bar = page.getByTestId("step-nav-mobile");
  await expect(bar).toBeVisible();
  const vp = page.viewportSize()!;
  const bb = (await bar.boundingBox())!;
  expect(bb.y + bb.height).toBeGreaterThanOrEqual(vp.height - 4);
});

// ── AC2: Desktop no nav under preview ────────────────────────────────────────

test("AC2: desktop step 1-2 has no nav buttons below the preview column", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(2));
  await page.getByTestId("details-step").waitFor();
  // The old step-nav inside the left column is gone; only the top cluster exists
  const cluster = page.getByTestId("step-nav");
  await expect(cluster).toHaveCount(1);
  const clusterBox = (await cluster.boundingBox())!;
  const previewBox = (await page.getByTestId("preview-canvas").boundingBox())!;
  // cluster is above (smaller y) the preview
  expect(clusterBox.y + clusterBox.height).toBeLessThanOrEqual(previewBox.y + 10);
});

// ── AC3: Step 3 two-panel layout ─────────────────────────────────────────────

test("AC3a: step 3 shows two panels side by side on desktop", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  const left = await page.getByTestId("ceramics-step").locator("[data-testid='add-to-cart']").boundingBox();
  const right = await page.getByTestId("docked-cart-panel").boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  // panels are side by side — left ends before right begins
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x + 20);
});

test("AC3b: add product → row appears in docked cart panel (no overlay)", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();

  // no cart lines initially
  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(0);

  // add product
  await page.getByTestId("add-to-cart").click();

  // row appears in the docked panel without overlay
  await expect(panel.getByTestId("cart-line")).toHaveCount(1);
  // CartDrawer Sheet should NOT be open
  await expect(page.getByTestId("cart-drawer")).toBeHidden();
});

test("AC3c: docked cart total updates after add", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("add-to-cart").click();
  const total = page.getByTestId("docked-total");
  await expect(total).toBeVisible();
  const text = await total.textContent();
  expect(text).toMatch(/\d/); // contains a number
});

// ── AC4: Checkout inline in cart panel ───────────────────────────────────────

test("AC4a: 'Send bestilling' button expands order form inline in cart panel", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("docked-checkout").click();
  await expect(page.getByTestId("docked-checkout-form")).toBeVisible();
  await expect(page.getByTestId("order-form")).toBeVisible();
  // overlay drawer should NOT open
  await expect(page.getByTestId("cart-drawer")).toBeHidden();
});

test("AC4b: order form submits and clears cart (F05 path)", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("docked-checkout").click();
  await page.getByTestId("order-form").waitFor();

  // fill the form
  await page.getByTestId("order-name").fill("Test Testesen");
  await page.getByTestId("order-email").fill("test@example.com");
  await page.getByTestId("order-phone").fill("90000000");

  // submit — Turnstile is test-mode (no challenge in CI)
  await page.getByTestId("order-submit").click();

  // on success: navigate to /order confirmation page OR cart cleared
  await expect(page).toHaveURL(/\/order\?code=/, { timeout: 10_000 });
});

// ── AC5: CartDrawer only on steps 1-2 ────────────────────────────────────────

test("AC5: cart drawer from header opens on step 1 and 2, not on step 3 (drawer hidden until triggered)", async ({
  page,
}) => {
  // Steps 1-2: header cart button opens the overlay drawer
  for (const n of [1, 2] as const) {
    await page.goto(STEP(n));
    await page.getByTestId(n === 1 ? "design-step" : "details-step").waitFor();
    await page.getByTestId("cart-button").click();
    await expect(page.getByTestId("cart-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
  }

  // Step 3: cart drawer does NOT auto-open; docked panel is the cart view
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByTestId("cart-drawer")).toBeHidden();
  await expect(page.getByTestId("docked-cart")).toBeVisible();
});

// ── AC6: Mobile step 3 ───────────────────────────────────────────────────────

test("AC6a: mobile step 3 sticky summary bar visible", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  const bar = page.getByTestId("step-nav-mobile");
  await expect(bar).toBeVisible();
  const vp = page.viewportSize()!;
  const bb = (await bar.boundingBox())!;
  expect(bb.y + bb.height).toBeGreaterThanOrEqual(vp.height - 4);
});

test("AC6b: mobile step 3 back button navigates to step 2", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("back-step-mobile").click();
  await expect(page).toHaveURL(/step=2/);
  await expect(page.getByTestId("details-step")).toBeVisible();
});

test("AC6c: mobile step 3 summary bar shows count and total after add", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "mobile") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("add-to-cart").click();
  // the bar shows the item count or total
  const bar = page.getByTestId("step-nav-mobile");
  await expect(bar).toBeVisible();
  const text = await bar.textContent();
  expect(text).toMatch(/\d/);
});

// ── AC7: Regressions ─────────────────────────────────────────────────────────

test("AC7: F16 cart badge updates after add at step 3", async ({ page }) => {
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByTestId("cart-badge")).toBeHidden();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
});

test("AC7: F19 mini-plate visible in docked cart panel after add", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("add-to-cart").click();
  // Cart thumb (pattern or chip) should be visible in the docked panel
  const panel = page.getByTestId("docked-cart-panel");
  const thumb = panel.getByTestId("cart-thumb").or(panel.getByTestId("cart-thumb-chip"));
  await expect(thumb).toBeVisible();
});

test("AC7: stepper aria-current=step on active step at step 3", async ({
  page,
}) => {
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await expect(page.getByTestId("step-3")).toHaveAttribute("aria-current", "step");
});
