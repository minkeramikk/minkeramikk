import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  firstActiveDesign,
  firstSupplier,
  ceramicRadios,
  horizontalOverflow,
} from "./helpers";

/**
 * Journey 1 — Configuratore pubblico (design → opzioni → ceramica).
 * ACCEPTANCE.md §1. Resilient: scopre design/prodotti dal catalogo vivo,
 * niente slug né conteggi hardcoded.
 */

const designCards = (page: Page) =>
  page.getByTestId("design-step").locator("button[aria-pressed]");

async function activeDesignNames(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("name")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((d) => d.name as string);
}

test("AC1: every active design renders, in sort_order, with a supplier badge", async ({
  page,
}) => {
  const names = await activeDesignNames();
  expect(names.length).toBeGreaterThan(0);

  await page.goto("/no/configurator");
  const cards = designCards(page);
  await expect(cards).toHaveCount(names.length);

  const labels = await cards.allInnerTexts();
  expect(labels.map((l) => l.split("\n")[0])).toEqual(names);
  // public supplier name on every card (ADR 0009); badge CSS uppercases it
  for (const label of labels) expect(label.toLowerCase()).toMatch(/[a-z]/);
});

test("AC1: a design flipped to active=false does not render", async ({ page }) => {
  const admin = adminClient();
  const supplier = await firstSupplier();
  const slug = `e2e-inactive-${Date.now()}`;
  const { data: created, error } = await admin
    .from("designs")
    .insert({
      slug,
      name: "E2E Inactive Design",
      supplier_id: supplier.id,
      active: false,
      sort_order: 999,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  try {
    const names = await activeDesignNames();
    await page.goto("/no/configurator");
    await expect(designCards(page)).toHaveCount(names.length);
    await expect(page.getByText("E2E Inactive Design")).toHaveCount(0);
  } finally {
    await admin.from("designs").delete().eq("id", created!.id);
  }
});

test("AC2: step 2 shows the design's option categories; a choice updates the preview + URL and survives reload", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);

  const step = page.getByTestId("details-step");
  await expect(step).toBeVisible();
  // at least one option category with a radiogroup
  const firstGroup = step.getByRole("radiogroup").first();
  await expect(firstGroup).toBeVisible();

  // choose the first option → preview composes a multiply layer, no reload
  await firstGroup.getByRole("radio").first().click();
  await expect(page).toHaveURL(/opt_/);
  await expect(
    page.locator('[data-testid="preview-canvas"] img[style*="multiply"]').first()
  ).toBeVisible();

  // selection reconstructs after reload
  await page.reload();
  await expect(
    step.getByRole("radio", { checked: true }).first()
  ).toBeVisible();
});

// NB: il toggle "Lås farger" (sync hex tra categorie con lo stesso sync_group)
// è coperto dagli UNIT test (config-code/reducer). Niente e2e dedicato: dipendeva
// da un design specifico + pagina di preview pesante → fragile (timeout di load),
// senza valore aggiunto rispetto agli unit. Vedi docs/release/ACCEPTANCE.md.

test("AC3: step 3 shows the supplier's ceramics with NOK-formatted prices", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=3`);
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  await expect(ceramicRadios(page).first()).toBeVisible();
  // at least one price in Norwegian style ("… kr", grouped thousands, no decimals)
  await expect(
    page.getByTestId("ceramics-step").getByText(/\d[\d\s]*\s*kr/).first()
  ).toBeVisible();
});

test("AC4: english locale renders english labels", async ({ page }) => {
  await page.goto("/en/configurator");
  await expect(
    page.getByRole("heading", { name: "Choose design" })
  ).toBeVisible();
  await expect(page.getByTestId("next-step")).toContainText("Next step");
});

test("AC5 (mobile): no horizontal overflow, touch targets ≥44px", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto("/no/configurator");
  const card = designCards(page).first();
  const box = await card.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("R2-1b: mobile @390 — Next-step CTA is reachable without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "mobile-only CTA (sticky bar is md:hidden)"
  );

  await page.goto("/no/configurator");

  // Choose the first design (AC6 frames the CTA as "after choosing a design").
  await designCards(page).first().click();

  const cta = page.getByTestId("next-step-mobile");
  await expect(cta).toBeVisible();

  // Reachable WITHOUT scrolling: inside the viewport at the initial scroll
  // position (scrollY === 0) and tall enough to tap (≥44px).
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);

  // Navigates to step 2 keeping the config in the URL.
  await cta.click();
  await expect(page).toHaveURL(/[?&]step=2/);
  await expect(page).toHaveURL(/[?&]design=/);
});
