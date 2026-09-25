import { test, expect } from "@playwright/test";
import { addFirstCeramic, adminClient, deleteOrder, fillOrderForm, HAS_SERVICE } from "./helpers";

/**
 * R5-SNELLA — the ONE customer journey of release 5, end to end:
 * step 1 (design) → step 2 (an option, palette saved) → step 3 (a painted
 * ceramic; unpaint it, Paint it back) → basket → order → confirmation.
 * Desktop + mobile. Entities discovered at runtime, nothing pinned.
 *
 * The basket is always read through the header drawer (`cart-button` →
 * `cart-drawer`): it exists on every viewport, while the docked column is
 * desktop-only and duplicates the same testids.
 */

const createdCodes: string[] = [];
test.afterAll(async () => {
  if (!HAS_SERVICE) return;
  const db = adminClient();
  for (const code of createdCodes) {
    const { data } = await db.from("orders").select("id").eq("code", code).maybeSingle();
    if (data) await deleteOrder((data as { id: string }).id);
  }
});

test("step 1 → 2 (palette saved) → 3 (painted, unpainted, painted again) → order", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";

  // step 1: pick the first design, walk on with the contextual pill
  await page.goto("/no/configurator");
  await page.getByTestId("design-step").locator("button[aria-pressed]").first().click();
  await page.getByTestId("next-step-mobile").click();
  await expect(page).toHaveURL(/[?&]step=2/);

  // step 2: one option DIFFERENT from the design's own default (R5-PALETTE-PLACE:
  // the draft/Save only appear once a choice actually differs from it — the
  // grid's first button IS that default on some designs, which used to save
  // a no-op "palette" indistinguishable from not having chosen anything),
  // then save the draft as a palette.
  const step2 = page.getByTestId("details-step");
  const grid = step2.getByTestId("option-grid").filter({ visible: true }).first();
  // colour categories are a radiogroup of Swatches (`aria-checked`), other
  // categories a plain grid of `OptionCard`s (`aria-pressed`) — either shape,
  // "not pressed/checked" is "not the one already selected".
  await grid.locator('[aria-checked="false"], button[aria-pressed="false"]').first().click();
  await expect(page).toHaveURL(/opt_/);
  // desktop: the PaletteCard's own Save · mobile: the strip's Save
  const save = page.getByTestId(mobile ? "save-palette-mobile" : "save-palette");
  await save.click();
  await expect(save).toBeHidden(); // saved = the draft now matches a palette
  await page.getByTestId("next-step").click();
  await expect(page).toHaveURL(/[?&]step=3/);

  // step 3: a ceramic, painted with the palette
  await addFirstCeramic(page);
  await page.getByTestId("cart-button").click();
  const drawer = page.getByTestId("cart-drawer");
  await expect(drawer.getByTestId("cart-line")).toHaveCount(1);
  await expect(drawer.getByTestId("basket-unpainted-note")).toHaveCount(0);

  // unpaint the line → the basket says so → Paint puts the palette back
  await drawer.getByTestId("cart-unpaint").click();
  await page.getByTestId("unpaint-confirm").click();
  await expect(drawer.getByTestId("basket-unpainted-note")).toBeVisible();
  await drawer.getByTestId("paint-line").click();
  await expect(drawer.getByTestId("basket-unpainted-note")).toHaveCount(0);

  // basket → order → confirmation
  await page.getByTestId("cart-checkout").click();
  await page.getByTestId("order-form").waitFor();
  await fillOrderForm(page, "Kari Nordmann", "kari@example.no");

  // legal links open in a sheet without leaving the order form — the form
  // (and Turnstile's token) stays mounted underneath, closing the sheet
  // leaves it exactly as filled.
  await page.getByTestId("order-terms-link").click();
  await expect(page.getByTestId("legal-sheet")).toBeVisible();
  await page.getByTestId("legal-sheet-close").click();
  await expect(page.getByTestId("legal-sheet")).toBeHidden();
  await expect(page.getByTestId("order-name")).toHaveValue("Kari Nordmann");
  await expect(page.getByTestId("order-terms")).toBeChecked();

  await page.getByTestId("order-submit").click();
  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  const code = await page.getByTestId("order-code").innerText();
  createdCodes.push(code);
  expect(code).toMatch(/^MK-\d+$/);
});
