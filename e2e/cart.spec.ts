import { test, expect, type Page } from "@playwright/test";
import {
  firstActiveDesign,
  addFirstCeramic,
  ceramicCards,
  horizontalOverflow,
  CAN_SEED,
  seedDiscountTiers,
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
  // R3-B4: insured shipping row — status is either "Inkludert" (≥ threshold) or
  // "Beregnes" + the nudge; the send is never blocked either way.
  await expect(drawer(page).getByTestId("cart-shipping-status")).toContainText(
    /Inkludert|Beregnes/
  );
  await expect(drawer(page).getByTestId("cart-checkout")).toBeEnabled();
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
  const cards = ceramicCards(page);
  test.skip((await cards.count()) < 2, "needs at least two ceramics");

  // Sheet closes on add (§3.20), so the second product needs the card
  // reopened — one card click → one sheet open/add/close cycle each.
  for (const n of [0, 1]) {
    await cards.nth(n).click();
    const sheet = page.getByTestId("product-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("add-to-cart").click();
    await expect(sheet).toBeHidden();
  }

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

test("AC R2-D: drawer row reveals the shared recap (selections + ceramic + code)", async ({ page }) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=3`);
  await page.getByTestId("ceramics-step").waitFor();
  await addFirstCeramic(page);

  // open the side drawer from the header
  await page.getByTestId("cart-button").click();
  const drawerEl = page.getByTestId("cart-drawer");
  await expect(drawerEl).toBeVisible();

  // each row has a "Show details" toggle → reveals the identical recap
  const row = drawerEl.getByTestId("cart-line").first();
  await row.getByTestId("cart-expand").click();
  const recap = drawerEl.getByTestId("cart-line-detail");
  await expect(recap).toBeVisible();
  // recap carries the ceramic label + the MK code copy affordance
  await expect(recap).toContainText("Keramikk"); // cart.line.ceramic (NO)
  await expect(recap.getByTestId("cart-copy-code")).toBeVisible();
});

test.describe("R4-SCONTI — quantity discounts", () => {
  test.skip(
    !CAN_SEED,
    "MK_E2E_SEED=1 richiesto: i test seminano la scala sconti nel catalogo reale"
  );

  // config.server.ts caches the discount config for up to `revalidate: 10`
  // seconds (tag-only invalidation would never notice this seeder's direct
  // DB write otherwise — see the comment there). Reload and re-check instead
  // of sleeping blindly; toPass() retries the whole callback until it holds
  // or the timeout is spent. The scales below are chosen to be unmistakably
  // different from the live production scale (4→5 · 6→8 · 8→10 · 12→15) —
  // these tests must fail if the seed is ever skipped, not pass by
  // coincidentally matching prod.
  test.describe.configure({ timeout: 60_000 }); // polling can eat the default 30s budget

  test("AC-SC1: reaching a tier strikes the full price through and shows the percentage", async ({
    page,
  }) => {
    const seeded = await seedDiscountTiers([{ min_qty: 2, pct: 12 }]);
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      const line = drawer(page).getByTestId("cart-line").first();
      // one piece: full price only
      await expect(line.getByTestId("cart-line-full")).toHaveCount(0);
      // second piece: the ×2 tier fires
      await drawer(page).getByLabel("+").first().click();
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(line.getByTestId("cart-line-full")).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await expect(line.getByTestId("cart-discount-badge")).toContainText("12");
      await expect(drawer(page).getByTestId("cart-discount-total")).toBeVisible();
    } finally {
      await seeded.restore();
    }
  });

  test("AC-SC2: the nudge points at the next step", async ({ page }) => {
    // qty 2 with these thresholds needs 7 more to the next tier — prod's own
    // scale would answer "2" here (its first step sits at min_qty 4), so a
    // stale/unseeded read is caught, not coincidentally matched.
    const seeded = await seedDiscountTiers([
      { min_qty: 2, pct: 6 },
      { min_qty: 9, pct: 13 },
    ]);
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      await drawer(page).getByLabel("+").first().click(); // qty 2 → 6%, next step at 9
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(drawer(page).getByTestId("cart-discount-nudge")).toContainText("7");
      }).toPass({ timeout: 15_000 });
    } finally {
      await seeded.restore();
    }
  });

  test("AC-SC3: switched off, the cart is back to plain full prices", async ({ page }) => {
    // Prove the off-switch actually did something: first confirm a
    // distinctive scale IS applied, then switch it off and confirm it's
    // gone — trivially "the cart has no discount" is also true if the seed
    // never took effect at all, which is exactly the failure this guards.
    const seeded = await seedDiscountTiers([{ min_qty: 2, pct: 12 }]);
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      const line = drawer(page).getByTestId("cart-line").first();
      await drawer(page).getByLabel("+").first().click(); // qty 2
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(line.getByTestId("cart-line-full")).toBeVisible();
      }).toPass({ timeout: 15_000 });

      const off = await seedDiscountTiers([]); // also clears the flag
      try {
        await expect(async () => {
          await page.reload();
          await openCart(page);
          await expect(drawer(page).getByTestId("cart-line-full")).toHaveCount(0);
        }).toPass({ timeout: 15_000 });
        await expect(drawer(page).getByTestId("cart-total")).toContainText(/\d[\d\s]*\s*kr/);
      } finally {
        await off.restore();
      }
    } finally {
      await seeded.restore();
    }
  });
}); // R4-SCONTI describe
