import { test, expect, type Page } from "@playwright/test";
import { adminClient } from "./helpers";

/** F01 — design selection (configurator step 1). AC numbers from the card. */

const designCards = (page: Page) =>
  page.getByTestId("design-step").locator("button[aria-pressed]");

test("AC1: the 6 active designs render in sort_order with supplier badge", async ({
  page,
}) => {
  await page.goto("/no/configurator");
  const cards = designCards(page);
  await expect(cards).toHaveCount(6);

  // sort_order from the imported catalog
  const labels = await cards.allInnerTexts();
  expect(labels.map((l) => l.split("\n")[0])).toEqual([
    "Blomster 1",
    "Blomster 2",
    "Amalfi Dyr",
    "Krabbe",
    "Striper",
    "Juletre",
  ]);

  // supplier badge on every card (public name per ADR 0009);
  // innerText is uppercased by the badge CSS, so compare case-insensitively
  for (const label of labels) {
    expect(label.toLowerCase()).toContain("vietri");
  }
});

test("AC2: selection drives preview + URL; refresh and back/forward preserve it", async ({
  page,
}) => {
  // F14: the first design (sort_order=1, Blomster 1) is preselected and the
  // preview shows its composed default at load.
  await page.goto("/no/configurator");
  await expect(
    page.locator('[data-testid="preview-canvas"] img[alt="Blomster 1"]').first()
  ).toHaveAttribute("src", /designs\/blomster-1\//);

  // selecting a DIFFERENT design drives the URL + preview
  await designCards(page).filter({ hasText: "Krabbe" }).click();
  await expect(page).toHaveURL(/design=krabbe/);

  await page.reload();
  await expect(page).toHaveURL(/design=krabbe/);
  await expect(
    designCards(page).filter({ hasText: "Krabbe" })
  ).toHaveAttribute("aria-pressed", "true");

  await page.goBack();
  await expect(
    designCards(page).filter({ hasText: "Blomster 1" })
  ).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await expect(page).toHaveURL(/design=krabbe/);
  await expect(
    designCards(page).filter({ hasText: "Krabbe" })
  ).toHaveAttribute("aria-pressed", "true");
});

test("AC3: supplierId exposed; CTA enabled (a design is always selected, F14)", async ({
  page,
}) => {
  await page.goto("/no/configurator");
  const step = page.getByTestId("design-step");
  const cta = page.getByTestId("next-step");

  // F14: a default design is preselected → CTA enabled, supplier hooked from the start
  await expect(cta).toBeEnabled();
  expect(await step.getAttribute("data-supplier-id")).toMatch(
    /^[0-9a-f-]{36}$/
  );

  await designCards(page).filter({ hasText: "Striper" }).click();
  await expect(cta).toBeEnabled();
  expect(await step.getAttribute("data-supplier-id")).toMatch(
    /^[0-9a-f-]{36}$/
  );
});

test("AC4: a design flipped to active=false via SQL does not render", async ({
  page,
}) => {
  const admin = adminClient();
  const { data: supplier } = await admin
    .from("public_suppliers")
    .select("id")
    .limit(1)
    .single();
  const slug = `f01-e2e-inactive-${Date.now()}`;
  const { data: created, error } = await admin
    .from("designs")
    .insert({
      slug,
      name: "E2E Inactive Design",
      supplier_id: supplier!.id,
      active: false,
      sort_order: 99,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  try {
    await page.goto("/no/configurator");
    await expect(designCards(page)).toHaveCount(6);
    await expect(page.getByText("E2E Inactive Design")).toHaveCount(0);
  } finally {
    await admin.from("designs").delete().eq("id", created!.id);
  }
});

test("AC4: english locale shows english labels", async ({ page }) => {
  await page.goto("/en/configurator");
  await expect(
    page.getByRole("heading", { name: "Choose design" })
  ).toBeVisible();
  await expect(page.getByTestId("next-step")).toContainText(
    "Next step: Details"
  );
});

test("AC5: 390px — 2-column grid, no horizontal overflow, ≥44px touch targets", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only assertions");

  await page.goto("/no/configurator");
  const cards = designCards(page);
  await expect(cards).toHaveCount(6);

  // 2 columns: cards 0 and 1 share a row, card 2 goes below
  const [a, b, c] = await Promise.all([
    cards.nth(0).boundingBox(),
    cards.nth(1).boundingBox(),
    cards.nth(2).boundingBox(),
  ]);
  expect(a!.y).toBeCloseTo(b!.y, 0);
  expect(c!.y).toBeGreaterThan(a!.y);

  // no horizontal overflow
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // touch targets ≥ 44px
  for (const box of [a, b, c]) {
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
