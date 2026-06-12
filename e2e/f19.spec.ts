import { test, expect } from "@playwright/test";

/** F19 — rich cart rows (mini composed plate) + session design code.
 *  Pure front-end (configurator + localStorage); runs at 390 / 1280. */

const DESIGN = "/no/configurator?design=blomster-1";
const STEP3 = `${DESIGN}&step=3`;

async function addOne(page: import("@playwright/test").Page) {
  await page.goto(STEP3);
  await page.getByTestId("ceramics-step").waitFor();
  await page.getByTestId("product-vietri-flat").click();
  await page.getByTestId("add-to-cart").click();
}

test("cart row renders a pattern-only mini + the chosen ceramic below", async ({
  page,
}) => {
  await addOne(page);
  await page.getByTestId("cart-button").click();
  // scope to the drawer: the F21 docked panels render the same thumbs again
  const drawer = page.getByTestId("cart-drawer");
  const thumb = drawer.getByTestId("cart-thumb").first();
  await expect(thumb).toBeVisible();
  expect(await thumb.locator("img").count()).toBeGreaterThan(0);
  // the chosen ceramic shows as a separate small image under the pattern
  await expect(drawer.getByTestId("cart-plate").first()).toBeVisible();
});

test("save/share widget sits by the preview in step 1 and step 2 (copy + paste)", async ({
  page,
}) => {
  await page.goto(DESIGN);
  await page.getByTestId("design-step").waitFor();
  await expect(page.getByTestId("config-code-bar")).toBeVisible(); // new in step 1
  const code = await page.getByTestId("config-code").innerText();
  await page.getByTestId("copy-code").click(); // no-op if clipboard blocked

  await page.getByTestId("next-step").click();
  await page.getByTestId("details-step").waitFor();
  await expect(page.getByTestId("config-code-bar")).toBeVisible(); // and step 2
  // change a colour, then paste the earlier code → it reloads that config
  await page
    .getByTestId("details-step")
    .getByRole("radiogroup")
    .first()
    .getByRole("radio")
    .nth(3)
    .click();
  await page.getByTestId("paste-input").fill(code);
  await page.getByTestId("paste-apply").click();
  await expect(page.getByTestId("config-code")).toHaveText(code);
});

test("reopen from a cart row loads that exact design", async ({ page }) => {
  await addOne(page);
  await page.getByTestId("cart-button").click();
  await expect(page.getByTestId("cart-reopen").first()).toBeVisible();
  await page.getByTestId("cart-reopen").first().click();
  await expect(page).toHaveURL(/\/configurator/);
  // the ?code= deep link is decoded into the canonical params
  await expect(page).toHaveURL(/design=blomster-1/);
});

test("a pre-F19 line (no layers) falls back to the chip, no crash", async ({
  page,
}) => {
  await page.goto("/no");
  await page.evaluate(() => {
    const line = {
      id: "p-old::MK-A",
      productId: "p-old",
      productNameNo: "Gammel vare",
      productNameEn: "Old item",
      supplierId: "s",
      supplierName: "Vietri",
      unitPriceCents: 50000,
      currency: "NOK",
      quantity: 1,
      configCode: "MK-A",
      configSnapshot: {
        designSlug: "blomster-1",
        designName: "Blomster 1",
        selections: [{ label: "Farge", option: "Blå", hex: "#456789" }],
      },
    };
    localStorage.setItem("mk-cart-v1", JSON.stringify([line]));
  });
  await page.reload();
  await page.getByTestId("cart-button").click();
  const drawer2 = page.getByTestId("cart-drawer");
  await expect(drawer2.getByTestId("cart-line")).toHaveCount(1);
  await expect(drawer2.getByTestId("cart-thumb-chip").first()).toBeVisible();
  await expect(drawer2.getByTestId("cart-thumb")).toHaveCount(0);
});
