import { test, expect, type Page } from "@playwright/test";
import { adminClient } from "./helpers";

/** F05 — order submission. Uses the dev Turnstile test key (auto-token) and
 *  the no-op email transport (no real sends). Created orders are cleaned up. */

const STEP3 = "/no/configurator?design=blomster-1&step=3";
const createdCodes: string[] = [];

test.afterAll(async () => {
  const db = adminClient();
  for (const code of createdCodes) await db.from("orders").delete().eq("code", code);
});

async function addToCart(page: Page) {
  await page.goto(STEP3);
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("add-to-cart").click();
  // F16: checkout is reached from the cart drawer, not inline in step 3
  await page.getByTestId("cart-button").click();
  await page.getByTestId("cart-checkout").click();
  await page.getByTestId("order-form").waitFor();
}

test("AC1/AC2/AC6: cart → form → confirmation; cart cleared; code shown", async ({
  page,
}) => {
  await addToCart(page);
  await page.getByTestId("order-name").fill("Kari Nordmann");
  await page.getByTestId("order-email").fill("kari@example.no");
  await page.getByTestId("order-submit").click();

  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  const code = await page.getByTestId("order-code").innerText();
  createdCodes.push(code);
  expect(code).toMatch(/^MK-\d+$/);
  await expect(page).toHaveURL(/\/order\?code=MK-/);

  // cart cleared (localStorage)
  const cart = await page.evaluate(() => localStorage.getItem("mk-cart-v1"));
  expect(cart === null || cart === "[]").toBeTruthy();
});

test("AC1: client validation blocks an invalid email (no order, cart kept)", async ({
  page,
}) => {
  await addToCart(page);
  await page.getByTestId("order-name").fill("Kari");
  await page.getByTestId("order-email").fill("not-an-email");
  await page.getByTestId("order-submit").click();

  // stayed on the form (zod blocked), email marked invalid, cart preserved
  await expect(page.getByTestId("order-email")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await expect(page).not.toHaveURL(/\/order\?code=/);
  const cart = await page.evaluate(() => localStorage.getItem("mk-cart-v1"));
  expect(cart).toContain("Vietri");
});

test("AC8 (en): confirmation page renders in English", async ({ page }) => {
  await page.goto("/en/order?code=MK-9999");
  await expect(page.getByTestId("order-code")).toHaveText("MK-9999");
  await expect(page.getByRole("heading")).toContainText("Thank you");
});

test("AC8 (mobile): order form usable, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await addToCart(page);
  await expect(page.getByTestId("order-name")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
