import { test, expect, type Page } from "@playwright/test";
import {
  addFirstCeramic,
  adminClient,
  fillOrderForm,
  firstActiveDesign,
  HAS_SERVICE,
  horizontalOverflow,
} from "./helpers";

/**
 * Journey 4 — Invio ordine. ACCEPTANCE.md §4 (storia F05 · ADR 0013).
 * Gira con RESEND disattivata: l'ordine è creato e la conferma testata, l'invio
 * è ortogonale (coperto da `order-email.spec.ts` / `make test-email`).
 * Turnstile: la build e2e usa la site key vuota → token always-pass.
 */

let step3 = "";
const createdCodes: string[] = [];

test.beforeAll(async () => {
  const design = await firstActiveDesign();
  step3 = `/no/configurator?design=${design.slug}&step=3`;
});

test.afterAll(async () => {
  if (!HAS_SERVICE) return; // can't clean without the service role
  const db = adminClient();
  for (const code of createdCodes) await db.from("orders").delete().eq("code", code);
});

async function toCheckout(page: Page) {
  await page.goto(step3);
  await addFirstCeramic(page);
  await page.getByTestId("cart-button").click();
  await page.getByTestId("cart-checkout").click();
  await page.getByTestId("order-form").waitFor();
}

test("AC1: cart → form → confirmation; code shown; cart cleared", async ({ page }) => {
  await toCheckout(page);
  await fillOrderForm(page, "Kari Nordmann", "kari@example.no");
  await page.getByTestId("order-submit").click();

  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  const code = await page.getByTestId("order-code").innerText();
  createdCodes.push(code);
  expect(code).toMatch(/^MK-\d+$/);
  await expect(page).toHaveURL(/\/order\?code=MK-/);

  const cart = await page.evaluate(() => localStorage.getItem("mk-cart-v1"));
  expect(cart === null || cart === "[]").toBeTruthy();
});

test("AC2: invalid email blocks the order (cart kept, field marked invalid)", async ({
  page,
}) => {
  await toCheckout(page);
  await fillOrderForm(page, "Kari", "not-an-email");
  await page.getByTestId("order-submit").click();

  await expect(page.getByTestId("order-email")).toHaveAttribute("aria-invalid", "true");
  await expect(page).not.toHaveURL(/\/order\?code=/);
  const cart = await page.evaluate(() => localStorage.getItem("mk-cart-v1"));
  expect(cart).not.toBeNull();
  expect(cart).not.toBe("[]");
});

// Regola 3/9: tutto obbligatorio tranne la nota, più il consenso esplicito.
// Le due metà si rompono in modo diverso — un campo vuoto e una casella non
// spuntata — quindi sono due test, non uno con due assert.
test("AC2-bis: a required field left empty blocks the order", async ({ page }) => {
  await toCheckout(page);
  await fillOrderForm(page, "Kari", "kari@example.no");
  await page.getByTestId("order-zipcode").fill("");
  await page.getByTestId("order-submit").click();

  await expect(page.getByTestId("order-zipcode")).toHaveAttribute("aria-invalid", "true");
  await expect(page).not.toHaveURL(/\/order\?code=/);
});

test("AC2-ter: the order does not leave until the terms box is ticked", async ({
  page,
}) => {
  await toCheckout(page);
  await fillOrderForm(page, "Kari", "kari@example.no", { acceptTerms: false });
  await page.getByTestId("order-submit").click();

  await expect(page.getByTestId("order-terms")).toHaveAttribute("aria-invalid", "true");
  await expect(page).not.toHaveURL(/\/order\?code=/);

  // e spuntandola, lo stesso click passa
  await page.getByTestId("order-terms").check();
  await page.getByTestId("order-submit").click();
  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  createdCodes.push(await page.getByTestId("order-code").innerText());
});

test("AC3: the confirmation page renders in English", async ({ page }) => {
  await page.goto("/en/order?code=MK-9999");
  await expect(page.getByTestId("order-code")).toHaveText("MK-9999");
  // level 1 on purpose: R4-TAKK added the «How to pay» / «What happens now»
  // <h2>s, so a bare getByRole("heading") is no longer a single element.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
});

test("AC mobile: order form usable, no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await toCheckout(page);
  await expect(page.getByTestId("order-name")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
