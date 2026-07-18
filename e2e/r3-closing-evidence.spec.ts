import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { ADMIN_READY, adminClient, loadEnvLocal, loginAdmin } from "./helpers";

/**
 * R3-CLOSING evidence (tooling, NOT a gate) — screenshots + mobile video for
 * the PR: ① step-1 contextual block, ② step-2 explicit CTA, ③ length attribute,
 * ④ always-open product details.
 *
 * Run: npx playwright test e2e/r3-closing-evidence.spec.ts --project=evidence
 */
loadEnvLocal();
const OUT = "docs/evidence/r3-closing";
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { w: 390, h: 844, tag: "390" },
  { w: 768, h: 1024, tag: "768" },
  { w: 1280, h: 800, tag: "1280" },
];

test("①② step 1 + step 2 at 390/768/1280 (NO)", async ({ page }) => {
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.w, height: s.h });

    await page.goto("/no/configurator");
    const card = page
      .getByTestId("design-step")
      .locator("button[aria-pressed]")
      .nth(1);
    await card.click();
    // the selection round-trips through the URL → wait for the re-render
    await expect(card).toHaveAttribute("aria-pressed", "true");
    // let `transition-colors` settle, otherwise the previously selected card is
    // caught mid-fade and the shot looks like two selections
    await page.waitForTimeout(400);
    const block = page.getByTestId("design-context-block");
    await expect(block).toBeVisible();
    await page.screenshot({ path: `${OUT}/01-step1-block-${s.tag}.png`, fullPage: true });

    await page.goto("/no/configurator?step=2&design=blomster-2");
    await expect(page.getByTestId("details-step")).toBeVisible();
    await page.screenshot({ path: `${OUT}/02-step2-cta-${s.tag}.png`, fullPage: true });
  }
});

test("① step-1 block in EN (per-locale description)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/configurator");
  const card = page.getByTestId("design-step").locator("button[aria-pressed]").nth(1);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(400);
  await expect(page.getByTestId("design-context-block")).toBeVisible();
  await page.screenshot({ path: `${OUT}/03-step1-block-en-390.png`, fullPage: true });
});

test("④ step 3 — product details open with no click", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/no/configurator?step=3&design=blomster-2");
  await page.getByTestId("ceramics-step").waitFor();
  await page.locator('[data-testid^="product-"]').first().click();
  const expanded = page.getByTestId("expanded-card");
  await expect(expanded).toBeVisible();
  await expect(page.getByTestId("product-details")).toBeVisible();
  await expect(expanded.getByTestId("details-toggle")).toHaveCount(0);
  await expanded.screenshot({ path: `${OUT}/04-step3-details-open.png` });
  await page.screenshot({ path: `${OUT}/04-step3-full.png`, fullPage: true });
});

/**
 * ③ length attribute — driven through the admin UI so `revalidateTag("catalog")`
 * fires. Uses a product that has NO attributes of its own (`redskapstativ`), so
 * the cleanup (remove every row) restores the exact original state.
 */
test("③ length: admin editor → public spec chip", async ({ page }) => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL + ADMIN_PASSWORD + service role");
  await page.setViewportSize({ width: 1280, height: 900 });

  const { data: product, error } = await adminClient()
    .from("products")
    .select("id, slug, product_attributes(key)")
    .eq("slug", "redskapstativ")
    .single();
  if (error) throw error;
  expect(product!.product_attributes ?? []).toHaveLength(0); // never clobber real data

  try {
    await loginAdmin(page);
    await page.goto(`/admin/products/${product!.id}`);
    await page.getByTestId("product-form").waitFor();
    await page.getByTestId("attribute-add").click();
    const row = page.getByTestId("attribute-row").nth(0);
    await row.getByTestId("attribute-type").selectOption("length");
    await row.getByTestId("attribute-value-num").fill("400");
    await page.getByTestId("product-attributes").screenshot({
      path: `${OUT}/05-admin-length-editor.png`,
    });
    await page.getByTestId("product-save").click();
    await expect(page).toHaveURL(/\/admin\/products$/);

    await page.goto("/no/configurator?step=3&design=blomster-2");
    await page.getByTestId("ceramics-step").waitFor();
    await page.getByTestId(`product-${product!.slug}`).click();
    const expanded = page.getByTestId("expanded-card");
    await expect(expanded.getByTestId("spec-chips")).toContainText("Lengde");
    await expect(expanded.getByTestId("spec-chips")).toContainText("40 cm");
    await expanded.screenshot({ path: `${OUT}/06-public-length-chip-no.png` });

    await page.goto("/en/configurator?step=3&design=blomster-2");
    await page.getByTestId("ceramics-step").waitFor();
    await page.getByTestId(`product-${product!.slug}`).click();
    await expect(page.getByTestId("expanded-card").getByTestId("spec-chips")).toContainText("Length");
    await page.getByTestId("expanded-card").screenshot({
      path: `${OUT}/07-public-length-chip-en.png`,
    });
  } finally {
    // Restore: the product started with zero attributes → remove every row.
    await page.goto(`/admin/products/${product!.id}`);
    await page.getByTestId("product-form").waitFor();
    for (let n = await page.getByTestId("attribute-remove").count(); n > 0; n--) {
      await page.getByTestId("attribute-remove").first().click();
    }
    await page.getByTestId("product-save").click();
    await expect(page).toHaveURL(/\/admin\/products$/);
  }
});

/**
 * ① fallback — a design with NO description renders name + CTA only. Emptied
 * and restored through the admin UI (revalidates the `catalog` cache); the
 * design used is the F39 test clone, and the original copy is written back in
 * `finally`.
 */
test("① fallback: design without description → name + CTA only", async ({ page }) => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL + ADMIN_PASSWORD + service role");
  await page.setViewportSize({ width: 390, height: 844 });

  const { data: design, error } = await adminClient()
    .from("designs")
    .select("id, slug, description_no, description_en")
    .eq("slug", "striper-no-copy")
    .single();
  if (error) throw error;

  async function setDescription(no: string, en: string) {
    await page.goto(`/admin/designs/${design!.id}`);
    await page.getByTestId("design-form").waitFor();
    await page.locator("#descriptionNo").fill(no);
    await page.locator("#descriptionEn").fill(en);
    await page.getByTestId("design-save").click();
    await expect(page).toHaveURL(/\/admin\/designs$/);
  }

  await loginAdmin(page);
  try {
    await setDescription("", "");
    await page.goto(`/no/configurator?design=${design!.slug}`);
    const block = page.getByTestId("design-context-block");
    await expect(block).toBeVisible();
    await expect(block).toContainText("Neste steg: Velg farger");
    await page.screenshot({ path: `${OUT}/08-step1-block-no-description-390.png`, fullPage: true });
  } finally {
    await setDescription(design!.description_no ?? "", design!.description_en ?? "");
  }
});

/**
 * ⑤ lab PDF — the F38 inscription row must read "TEXT ON THE PRODUCT:" (the
 * PDF is English for an Italian workshop). Seeds a throwaway order with an
 * inscription, downloads the real PDF and deletes the order.
 */
test("⑤ lab PDF: inscription label in English", async ({ page }) => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL + ADMIN_PASSWORD + service role");
  const db = adminClient();
  const { data: design, error: dErr } = await db
    .from("designs")
    .select("slug, name, supplier_id")
    .eq("active", true)
    .limit(1)
    .single();
  if (dErr) throw dErr;
  const { data: supplier, error: sErr } = await db
    .from("suppliers")
    .select("id, name")
    .eq("id", design!.supplier_id)
    .single();
  if (sErr) throw sErr;

  const { data: order, error: oErr } = await db
    .from("orders")
    .insert({
      code: `MK-EVID-R3C-${Date.now()}`,
      customer_name: "Evidence R3-CLOSING",
      email: "e@example.no",
      locale: "no",
      status: "new",
    })
    .select("id")
    .single();
  if (oErr) throw oErr;

  try {
    await db.from("order_items").insert({
      order_id: order!.id,
      supplier_id: supplier!.id,
      supplier_name_snapshot: supplier!.name,
      product_name_snapshot: "Vietri Flat",
      price_cents_snapshot: 50000,
      currency_snapshot: "NOK",
      quantity: 2,
      config_snapshot: {
        designSlug: design!.slug,
        designName: design!.name,
        selections: [],
        customText: "Gratulerer med dagen",
      },
    });

    await loginAdmin(page);
    const res = await page.request.get(
      `/api/admin/orders/${order!.id}/pdf?supplier=${supplier!.id}`
    );
    expect(res.status()).toBe(200);
    writeFileSync(`${OUT}/09-lab-pdf-english-label.pdf`, await res.body());
  } finally {
    await db.from("orders").delete().eq("id", order!.id);
  }
});

/** ②bis clickable teaser — focus ring on step 1, in-flow position on step 2. */
test("②bis teaser: focus state + step-2 placement", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/no/configurator");
  const teaser = page.locator('[data-testid="next-step-teaser"]:visible').first();
  await teaser.focus();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/10-teaser-focus-step1-390.png`, fullPage: true });

  await page.goto("/no/configurator?step=2&design=blomster-2");
  const teaser2 = page.locator('[data-testid="next-step-teaser"]:visible').first();
  await expect(teaser2).toBeVisible();
  await teaser2.hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/11-teaser-step2-inflow-390.png`, fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/no/configurator?step=2&design=blomster-2");
  await page.locator('[data-testid="next-step-teaser"]:visible').first().hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/12-teaser-desktop-1280.png`, fullPage: true });
});
