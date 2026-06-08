import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnvLocal, adminClient } from "./helpers";

loadEnvLocal();
const OUT08 = "docs/evidence/f08";

test("F08: real production-order PDF from a test order (2 lines)", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "needs admin + service role"
  );
  mkdirSync(OUT08, { recursive: true });
  const db = adminClient();
  const code = `MK-EVID-F08-${Date.now()}`;
  const { data: designs } = await db
    .from("designs")
    .select("code, slug, name")
    .not("code", "is", null)
    .limit(2);
  const { data: supplier } = await db.from("suppliers").select("id, name").limit(1).single();
  const { data: order } = await db
    .from("orders")
    .insert({ code, customer_name: "Evidence", email: "e@example.no", locale: "no", status: "new" })
    .select("id")
    .single();
  const lines = (designs ?? []).map((d, i) => ({
    order_id: order!.id,
    supplier_id: supplier!.id,
    supplier_name_snapshot: supplier!.name,
    product_name_snapshot: i === 0 ? "Vietri Flat" : "Serveringsfat Stor",
    price_cents_snapshot: 50000,
    currency_snapshot: "NOK",
    quantity: i === 0 ? 4 : 2,
    config_code: `MK-${d.code}`,
    config_snapshot: { designSlug: d.slug, designName: d.name, selections: [] },
  }));
  await db.from("order_items").insert(lines);

  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });

  const res = await page.request.get(
    `/api/admin/orders/${order!.id}/pdf?supplier=${supplier!.id}`
  );
  writeFileSync(`${OUT08}/production-order-sample.pdf`, await res.body());

  await db.from("orders").delete().eq("id", order!.id);
});

const OUT10 = "docs/evidence/f10";

test("F10a: designs list + design detail (form + categories + preview)", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "needs a seeded admin"
  );
  mkdirSync(OUT10, { recursive: true });
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/admin/designs");
  await page.getByTestId("admin-designs").waitFor();
  await page.screenshot({ path: `${OUT10}/f10-designs-list.png` });

  // detail of the first design: form + nested categories + composed preview
  await page.getByTestId("design-row").first().getByTestId("design-edit").click();
  await page.getByTestId("design-detail").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT10}/f10-design-detail.png`, fullPage: true });

  // F10b: options of the first category (swatches/hex/upload, anti-dup)
  await page.getByTestId("manage-options").first().click();
  await page.getByTestId("option-editor").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT10}/f10-options.png` });
});

const OUT09 = "docs/evidence/f09";

test("F09: catalog CRUD — products/suppliers lists + product form", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "needs a seeded admin"
  );
  mkdirSync(OUT09, { recursive: true });
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/products");
  await page.getByTestId("admin-products").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-products-list.png` });

  await page.goto("/admin/products/new");
  await page.getByTestId("product-form").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-product-form.png` });

  await page.goto("/admin/suppliers");
  await page.getByTestId("admin-suppliers").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-suppliers-list.png` });

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin/products/new");
  await page.getByTestId("product-form").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-product-form-390.png` });
});

const OUT06 = "docs/evidence/f06";

test("F06: login page + anon→login redirect at 390/1280", async ({ page }) => {
  mkdirSync(OUT06, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 800 });
    await page.goto("/admin"); // anon → redirected to login
    await page.getByTestId("login-form").waitFor({ state: "visible" });
    await page.screenshot({ path: `${OUT06}/f06-login-${width}.png` });
  }
});

test("F06: AdminShell (dashboard) desktop + mobile, after login", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "needs a seeded admin"
  );
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 800 });
    await page.goto("/admin");
    await page.getByTestId("logout").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT06}/f06-shell-${width}.png` });
  }
});

/**
 * PR evidence (not assertions): full-page screenshots of step 1 at the
 * three reference breakpoints, with a design selected.
 */
const OUT15 = "docs/evidence/f15";

test("F15: step 2 real assets — colors + animals at 390/1280", async ({ page }) => {
  mkdirSync(OUT15, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1500 : 1100 });
    // real glaze swatches in a wrapping grid (no carousel)
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT15}/f15-colors-${width}.png`, fullPage: true });
    // original animal art on tiles (no mask)
    await page.goto("/no/configurator?design=amalfi-dyr&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT15}/f15-animals-${width}.png`, fullPage: true });
  }
});

test("F15 sticky: preview pinned while scrolling the options (390 collapsed + 1280)", async ({
  page,
}) => {
  mkdirSync(OUT15, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 800 });
    await page.goto("/no/configurator?design=amalfi-dyr&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    // scroll mid-list: the preview stays pinned (mobile: collapsed thumbnail)
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT15}/f15-sticky-${width}.png` });
  }
});

const OUT05 = "docs/evidence/f05";

test("F05: order form + confirmation at 390/1280", async ({ page }) => {
  mkdirSync(OUT05, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1300 });
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("add-to-cart").click();
    // F16: checkout lives in the cart drawer
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("order-form").waitFor({ state: "visible" });
    await page.getByTestId("order-name").fill("Kari Nordmann");
    await page.getByTestId("order-email").fill("kari@example.no");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT05}/f05-form-${width}.png`, fullPage: true });
  }
  // confirmation page
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/no/order?code=MK-1042");
  await page.getByTestId("order-confirmation").waitFor({ state: "visible" });
  await page.screenshot({ path: `${OUT05}/f05-confirmation.png`, fullPage: true });
});

const OUT04 = "docs/evidence/f04";

test("F04: code bar (copy + paste) at 390/1280 + a code per design", async ({
  page,
}) => {
  mkdirSync(OUT04, { recursive: true });
  // one example code per design (text file for the PR)
  const slugs = [
    "blomster-1",
    "blomster-2",
    "amalfi-dyr",
    "krabbe",
    "striper",
    "juletre",
  ];
  const lines: string[] = [];
  for (const slug of slugs) {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/no/configurator?design=${slug}&step=2`);
    await page.getByTestId("config-code").waitFor({ state: "visible" });
    lines.push(`${slug}: ${await page.getByTestId("config-code").innerText()}`);
  }
  writeFileSync(`${OUT04}/codes.txt`, lines.join("\n") + "\n");

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1200 });
    await page.goto("/no/configurator?design=krabbe&step=2");
    await page.getByTestId("config-code-bar").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT04}/f04-codebar-${width}.png`, fullPage: true });
  }
});

const OUT13 = "docs/evidence/f13";

test("F13: textured swatches, monochrome icons, hover preview", async ({
  page,
}) => {
  mkdirSync(OUT13, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1400 : 1000 });
    // colour swatches + hover popup (desktop widths only)
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    if (width >= 768) {
      await page
        .getByTestId("category-details")
        .getByRole("radio")
        .nth(2)
        .hover();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${OUT13}/f13-swatches-${width}.png`, fullPage: true });
    // monochrome animal icons (normal + selected)
    await page.goto("/no/configurator?design=amalfi-dyr&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT13}/f13-icons-${width}.png`, fullPage: true });
  }
});

const OUT14 = "docs/evidence/f14";

test("F14: step1-default and step2 side by side (preview identical)", async ({
  page,
}) => {
  mkdirSync(OUT14, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1400 : 1000 });
    // step 1: default design already composed (no blank)
    await page.goto("/no/configurator");
    await page
      .locator('[data-testid="preview-canvas"] img')
      .first()
      .waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT14}/f14-step1-${width}.png`, fullPage: true });
    // step 2: same preview, only the right panel changed
    await page.getByTestId("next-step").click();
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT14}/f14-step2-${width}.png`, fullPage: true });
  }
});

const OUT = "docs/evidence/f01";

test("capture 390/768/1280 screenshots", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto("/no/configurator?design=blomster-1");
    await page
      .locator('img[alt="Blomster 1"]')
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(800); // image paint
    await page.screenshot({
      path: `${OUT}/f01-${width}.png`,
      fullPage: true,
    });
  }
});

const OUT3 = "docs/evidence/f03";

test("F03: capture 390/768/1280 with a populated cart", async ({ page }) => {
  mkdirSync(OUT3, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1100 : 1000 });
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("qty-inc").click();
    await page.getByTestId("add-to-cart").click();
    await page.getByTestId("product-serveringsfat-stor").click();
    await page.getByTestId("add-to-cart").click();
    // F16: the populated cart now lives in the drawer
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-drawer").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT3}/f03-${width}.png`, fullPage: true });
  }
});

const OUT16 = "docs/evidence/f16";

test("F16: cart drawer + badge at 390/1280", async ({ page }) => {
  mkdirSync(OUT16, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    // populate from step 3
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("qty-inc").click();
    await page.getByTestId("add-to-cart").click();
    await page.getByTestId("product-serveringsfat-stor").click();
    await page.getByTestId("add-to-cart").click();
    // badge in the header
    await page.getByTestId("cart-badge").waitFor({ state: "visible" });
    // open drawer
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-drawer").waitFor({ state: "visible" });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT16}/f16-drawer-${width}.png` });
    // checkout phase
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("order-form").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT16}/f16-checkout-${width}.png` });
  }
});

const OUT2 = "docs/evidence/f02";

test("F02: capture 390/768/1280 with selections + composed preview", async ({
  page,
}) => {
  mkdirSync(OUT2, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1100 : 1000 });
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    // make a colour choice in each category so the preview composes
    const groups = page.getByTestId("details-step").getByRole("radiogroup");
    const n = await groups.count();
    for (let i = 0; i < n; i++) {
      await groups.nth(i).getByRole("radio").nth(2 + i).click();
    }
    await page.waitForTimeout(900); // layer paint
    await page.screenshot({ path: `${OUT2}/f02-${width}.png`, fullPage: true });
  }
});
