import { test, expect, type Page } from "@playwright/test";
import { encodeSetParam } from "../src/lib/cart/set-code";
import { encodeKitParam } from "../src/lib/cart/kit-code";
import { addFirstCeramic, ceramicCards, designWithCode, type DesignRef } from "./helpers";

/**
 * R5-SNELLA — the two entry points of release 5 (`?code=` is gone, TL 24/9):
 * a shared set (`?set=`, step 3) and a curated kit (`?kit=`, step 2).
 * Desktop + mobile. Both params are built with the app's own codecs from a
 * design and a product discovered at runtime — no featured row is needed:
 * a kit resolves from the param alone, the shop-window row only adds an
 * image/label to the welcome.
 */

let design: DesignRef;
let step3 = "";
test.beforeAll(async () => {
  design = await designWithCode();
  step3 = `/no/configurator?design=${design.slug}&step=3`;
});

/** Slug of the first ceramic step 3 actually shows for this design. */
async function firstCeramicSlug(page: Page): Promise<string> {
  await page.goto(step3);
  await page.getByTestId("ceramics-step").waitFor();
  const id = await ceramicCards(page).first().getAttribute("data-testid");
  return id!.replace(/^product-/, "");
}

test("?set= on a non-empty basket: the banner offers the set, «add» merges its pieces", async ({
  page,
}) => {
  const slug = await firstCeramicSlug(page);
  await addFirstCeramic(page); // a non-empty basket → the 3-way choice, never a silent apply
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  const set = encodeSetParam([{ configCode: `MK-${design.code}`, productSlug: slug, quantity: 1 }]);
  await page.goto(`/no/configurator?step=3&set=${encodeURIComponent(set)}`);
  await expect(page.getByTestId("shared-set-banner")).toBeVisible();
  await page.getByTestId("shared-set-add").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
  await expect(page).not.toHaveURL(/[?&]set=/); // consumed once
});

test("?kit= lands on step 2: welcome, kit strip, pieces in the basket", async ({ page }, testInfo) => {
  const slug = await firstCeramicSlug(page);
  const kit = encodeKitParam(design.code!, [{ productSlug: slug, quantity: 2 }]);
  await page.goto(`/no/configurator?step=2&kit=${encodeURIComponent(kit)}`);

  const welcome = page.getByTestId("kit-welcome");
  await expect(welcome).toBeVisible();
  await welcome.getByTestId("kit-welcome-self").click();
  await expect(welcome).toBeHidden();
  await expect(page.getByTestId("details-step")).toBeVisible();
  await expect(page.getByTestId("kit-strip")).toBeVisible();
  await expect(page.getByTestId("cart-badge")).toHaveText("2");

  // TL ruling 25/9 (reverses R5-KIT T5): the design switch stays available in
  // kit-mode — the customer can paint the kit's pieces with different designs.
  const isMobile = testInfo.project.name === "mobile";
  await expect(
    page.getByTestId(isMobile ? "design-switch-badge" : "design-switch-row")
  ).toBeVisible();
});
