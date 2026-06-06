import { test, expect, type Page } from "@playwright/test";

/** F03 — ceramics & cart (configurator step 3). AC numbers from the card. */

const STEP3 = "/no/configurator?design=blomster-1&step=3";

const products = (page: Page) =>
  page.getByTestId("ceramics-step").getByRole("radio");

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

test("AC2+AC4: add to cart creates a line with product, design, supplier, subtotal", async ({
  page,
}) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("qty-inc").click(); // qty 2
  await page.getByTestId("add-to-cart").click();

  const line = page.getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Vietri Flat");
  await expect(line).toContainText("Blomster 1"); // configured design
  await expect(line.getByText("Vietri", { exact: true })).toBeVisible(); // SupplierBadge
  // 2 × 500 kr = 1000 kr
  await expect(line).toContainText(/1\s?000\s*kr/);
  await expect(page.getByTestId("cart-total")).toContainText(/1\s?000\s*kr/);
});

test("AC3: cart persists across a reload", async ({ page }) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-dyp").click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-line")).toContainText("Vietri Dyp");
});

test("AC4: two different products → two lines, total is their sum", async ({
  page,
}) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click(); // 500
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("product-serveringsfat-stor").click(); // 1300
  await page.getByTestId("add-to-cart").click();

  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("cart-total")).toContainText(/1\s?800\s*kr/);
});

test("AC5: changing quantity and removing updates total; empty → empty state", async ({
  page,
}) => {
  await page.goto(STEP3);
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("add-to-cart").click();

  // bump qty in the cart line to 3 → 1500 kr
  const line = page.getByTestId("cart-line");
  await line.getByRole("button", { name: "+" }).click();
  await line.getByRole("button", { name: "+" }).click();
  await expect(page.getByTestId("cart-total")).toContainText(/1\s?500\s*kr/);

  // remove → empty state with CTA
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

  const addBtn = page.getByTestId("add-to-cart");
  const box = await addBtn.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const inc = await page.getByTestId("qty-inc").boundingBox();
  expect(inc!.height).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
