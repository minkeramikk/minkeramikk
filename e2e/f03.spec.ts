import { test, expect, type Page } from "@playwright/test";

/** F03 — ceramics & cart (configurator step 3). AC numbers from the card.
 *  F16: the cart VIEW + checkout moved to the shared CartDrawer (opened from
 *  the header CartButton); step 3 keeps the chooser + "add to basket". */

const STEP3 = "/no/configurator?design=blomster-1&step=3";

const products = (page: Page) =>
  page.getByTestId("ceramics-step").getByRole("radio");

/** Open the cart drawer from the header button. */
const openCart = (page: Page) => page.getByTestId("cart-button").click();

/** Scope cart queries to the DRAWER: since F21 the step-3 docked panels render
 *  the same cart-line/cart-total testids twice more in the DOM. */
const drawer = (page: Page) => page.getByTestId("cart-drawer");

test("AC1: shows the supplier's visible ceramics with formatted prices", async ({
  page,
}) => {
  await page.goto(STEP3);
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  await expect(products(page)).toHaveCount(8); // Vietri catalog
  // price formatted Norwegian style (grouped thousands, "kr", no decimals)
  await expect(
    page.getByTestId("product-bat-serveringsfat")
  ).toContainText(/1\s?500\s*kr/);
});

test("AC2+AC4: add to cart creates a drawer line with product, design, subtotal", async ({
  page,
}) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("qty-inc").click(); // qty 2
  await page.getByTestId("add-to-cart").click();

  // badge reflects the count without opening the drawer
  await expect(page.getByTestId("cart-badge")).toHaveText("2");

  await openCart(page);
  const line = drawer(page).getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Vietri Flat");
  await expect(line).toContainText("Blomster 1"); // configured design
  // 2 × 500 kr = 1000 kr
  await expect(line).toContainText(/1\s?000\s*kr/);
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/1\s?000\s*kr/);
});

test("AC3: cart persists across a reload (badge + drawer)", async ({ page }) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-dyp").click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await page.reload();
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
  await openCart(page);
  await expect(drawer(page).getByTestId("cart-line")).toHaveCount(1);
  await expect(drawer(page).getByTestId("cart-line")).toContainText("Vietri Dyp");
});

test("AC4: two different products → two lines, total is their sum", async ({
  page,
}) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click(); // 500
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("product-serveringsfat-stor").click(); // 1300
  await page.getByTestId("add-to-cart").click();

  await openCart(page);
  await expect(drawer(page).getByTestId("cart-line")).toHaveCount(2);
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/1\s?800\s*kr/);
});

test("AC5: changing quantity and removing updates total; empty → empty state", async ({
  page,
}) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("add-to-cart").click();
  await openCart(page);

  // bump qty in the drawer line to 3 → 1500 kr
  const line = drawer(page).getByTestId("cart-line");
  await line.getByRole("button", { name: "+" }).click();
  await line.getByRole("button", { name: "+" }).click();
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/1\s?500\s*kr/);

  // remove → empty state with CTA (drawer stays open)
  await page.getByTestId("cart-remove").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

test("AC6 (mobile): touch targets ≥44px, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("add-to-cart").click();

  for (const id of ["add-to-cart", "qty-inc", "cart-button"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
