import { test, expect, type Page } from "@playwright/test";

/** F16 — persistent cart drawer. The cart data already persists (F03); this
 *  covers the SHARED VIEW: a header CartButton + badge visible on every step,
 *  and a shadcn-Sheet drawer for editing the cart and reaching checkout.
 *  Runs on both projects → desktop 1280 and mobile 390. */

const DESIGN = "/no/configurator?design=blomster-1";
const STEP = (n: 1 | 2 | 3) => (n === 1 ? DESIGN : `${DESIGN}&step=${n}`);

const openCart = (page: Page) => page.getByTestId("cart-button").click();

/** Scope cart queries to the DRAWER: since F21 the step-3 docked panels render
 *  the same cart testids twice more in the DOM. */
const drawer = (page: Page) => page.getByTestId("cart-drawer");

async function addOneAtStep3(page: Page) {
  await page.goto(STEP(3));
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("add-to-cart").click();
}

test("AC1: CartButton is present on every step and opens the drawer", async ({
  page,
}) => {
  for (const n of [1, 2, 3] as const) {
    await page.goto(STEP(n));
    const btn = page.getByTestId("cart-button");
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByTestId("cart-drawer")).toBeVisible();
    // Esc closes (Radix focus management)
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cart-drawer")).toBeHidden();
  }
});

test("AC2: badge hidden when empty, counts items, persists across steps", async ({
  page,
}) => {
  await page.goto(STEP(1));
  await expect(page.getByTestId("cart-badge")).toBeHidden();

  await addOneAtStep3(page);
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  // add another unit of the same product → merges → count 2
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("2");

  // navigate back to step 1 and 2 — the badge follows the cart
  await page.goto(STEP(1));
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
  await page.goto(STEP(2));
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
});

test("AC3: empty drawer shows the empty state + configurator CTA (no checkout)", async ({
  page,
}) => {
  await page.goto(STEP(1));
  await openCart(page);
  await expect(page.getByTestId("cart-empty")).toBeVisible();
  await expect(page.getByTestId("cart-checkout")).toHaveCount(0);
  // CTA closes the drawer and routes to the configurator
  await page.getByTestId("cart-empty").getByRole("link").click();
  await expect(page).toHaveURL(/\/configurator/);
});

test("AC4: edit quantity and remove from the drawer updates total/badge", async ({
  page,
}) => {
  await addOneAtStep3(page);
  await openCart(page);

  const line = drawer(page).getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await line.getByRole("button", { name: "+" }).click(); // qty 2
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/1\s?000\s*kr/);
  await expect(page.getByTestId("cart-badge")).toHaveText("2");

  await line.getByRole("button", { name: "-" }).click(); // qty 1
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/500\s*kr/);

  await drawer(page).getByTestId("cart-remove").click();
  await expect(drawer(page).getByTestId("cart-empty")).toBeVisible();
  await expect(page.getByTestId("cart-badge")).toBeHidden();
});

test("AC5: checkout is reached from the drawer (cart ↔ form)", async ({
  page,
}) => {
  await addOneAtStep3(page);
  await openCart(page);

  await page.getByTestId("cart-checkout").click();
  await expect(page.getByTestId("order-form")).toBeVisible();
  await expect(page.getByTestId("order-name")).toBeVisible();

  // back returns to the cart list
  await page.getByTestId("cart-back").click();
  await expect(page.getByTestId("cart-total")).toBeVisible();
});

test("AC6 (F21): step 3 shows the cart inline in the docked panel", async ({ page }) => {
  // F21 superseded the "View basket" button: on step 3 the cart IS the docked
  // panel (desktop right column / mobile inline section) — no drawer needed.
  await addOneAtStep3(page);
  const visiblePanel = page.locator('[data-testid="docked-cart"]:visible');
  await expect(visiblePanel).toHaveCount(1);
  await expect(visiblePanel.getByTestId("cart-line")).toHaveCount(1);
});

test("AC7 (mobile): drawer is full-height, button ≥44px, no overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto(STEP(1));

  const btnBox = await page.getByTestId("cart-button").boundingBox();
  expect(btnBox!.height).toBeGreaterThanOrEqual(44);
  expect(btnBox!.width).toBeGreaterThanOrEqual(44);

  await openCart(page);
  const drawer = await page.getByTestId("cart-drawer").boundingBox();
  const vp = page.viewportSize()!;
  expect(drawer!.height).toBeGreaterThanOrEqual(vp.height - 2); // full height
  expect(drawer!.width).toBeGreaterThanOrEqual(vp.width - 2); // full width

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
