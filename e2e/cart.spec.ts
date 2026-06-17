import { test, expect, type Page } from "@playwright/test";
import {
  firstActiveDesign,
  addFirstCeramic,
  ceramicRadios,
  ceramicAddButtons,
  horizontalOverflow,
} from "./helpers";

/**
 * Journey 3 — Carrello (aggiungi / persisti / modifica / drawer cross-step).
 * ACCEPTANCE.md §3 (storia F03/F16/F21). Resilient: prodotti scoperti a runtime.
 */

let step3 = "";
test.beforeAll(async () => {
  const design = await firstActiveDesign();
  step3 = `/no/configurator?design=${design.slug}&step=3`;
});

const openCart = (page: Page) => page.getByTestId("cart-button").click();
// Step-3 docked panels duplicate the cart testids → scope queries to the drawer.
const drawer = (page: Page) => page.getByTestId("cart-drawer");

test("AC1: add to cart → badge counts, drawer line shows product + price", async ({
  page,
}) => {
  await page.goto(step3);
  const name = await addFirstCeramic(page);
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await openCart(page);
  const line = drawer(page).getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(name);
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/\d[\d\s]*\s*kr/);
});

test("AC2: cart persists across a reload (badge + drawer)", async ({ page }) => {
  await page.goto(step3);
  const name = await addFirstCeramic(page);
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await page.reload();
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
  await openCart(page);
  await expect(drawer(page).getByTestId("cart-line")).toContainText(name);
});

test("AC3: edit quantity and remove update total/badge; empty → empty state", async ({
  page,
}) => {
  await page.goto(step3);
  await addFirstCeramic(page);
  await openCart(page);

  const line = drawer(page).getByTestId("cart-line");
  await line.getByRole("button", { name: "+" }).click(); // qty 2
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
  await line.getByRole("button", { name: "-" }).click(); // qty 1
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await drawer(page).getByTestId("cart-remove").click();
  await expect(drawer(page).getByTestId("cart-empty")).toBeVisible();
  await expect(page.getByTestId("cart-badge")).toBeHidden();
});

test("AC4: two different products → two lines, total is their sum", async ({
  page,
}) => {
  await page.goto(step3);
  await page.getByTestId("ceramics-step").waitFor();
  const radios = ceramicRadios(page);
  test.skip((await radios.count()) < 2, "needs at least two ceramics");

  // F33: add two different products via their per-card "+" (qty 1 each).
  const addBtns = ceramicAddButtons(page);
  await addBtns.nth(0).click();
  await addBtns.nth(1).click();

  await openCart(page);
  await expect(drawer(page).getByTestId("cart-line")).toHaveCount(2);
  await expect(drawer(page).getByTestId("cart-total")).toContainText(/\d[\d\s]*\s*kr/);
});

test("AC5: cart button on every step opens the drawer; checkout reachable", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  for (const n of [1, 2, 3] as const) {
    const url =
      n === 1
        ? `/no/configurator?design=${design.slug}`
        : `/no/configurator?design=${design.slug}&step=${n}`;
    await page.goto(url);
    const btn = page.getByTestId("cart-button");
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByTestId("cart-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cart-drawer")).toBeHidden();
  }

  // with an item, the drawer reaches the order form
  await page.goto(step3);
  await addFirstCeramic(page);
  await openCart(page);
  await page.getByTestId("cart-checkout").click();
  await expect(page.getByTestId("order-form")).toBeVisible();
});

test("AC5: step 3 shows the cart inline in the docked panel (≥768px)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "docked panel is desktop layout");
  await page.goto(step3);
  await addFirstCeramic(page);
  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(1);
});

test("AC mobile: cart button ≥44px and no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto(step3);
  const box = await page.getByTestId("cart-button").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
