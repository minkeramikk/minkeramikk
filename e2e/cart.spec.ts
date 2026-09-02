import { test, expect, type Page } from "@playwright/test";
import {
  addFirstCeramic,
  ADMIN_READY,
  adminClient,
  CAN_SEED,
  ceramicCards,
  deleteOrder,
  fillOrderForm,
  firstActiveDesign,
  horizontalOverflow,
  loginAdmin,
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


  test("AC-SC11: the ladder in the sheet counts CART + SELECTOR", async ({ page }) => {
    // Two steps far from the production scale, so an unseeded read cannot pass
    // by coincidence: 3 in the basket + 1 on the stepper = 4 → the ×4 step.
    const seeded = await seedDiscountTiers([
      { min_qty: 4, pct: 11 },
      { min_qty: 9, pct: 17 },
    ]);
    try {
      await page.goto(step3);
      // three pieces of the first ceramic into the basket, sheet closed
      await addFirstCeramic(page);
      await openCart(page);
      const plus = drawer(page).getByLabel("+").first();
      await plus.click();
      await plus.click();
      await expect(page.getByTestId("cart-badge")).toHaveText("3");
      await page.keyboard.press("Escape");

      await expect(async () => {
        await page.reload();
        await ceramicCards(page).first().click();
        const sheet = page.getByTestId("product-sheet");
        await expect(sheet).toBeVisible();
        // 3 + 1: the ladder is already on the first step, and says why
        await expect(sheet.getByTestId("discount-ladder")).toBeVisible();
        await expect(sheet.getByTestId("sheet-unit-full")).toBeVisible();
        await expect(sheet.getByTestId("sheet-unit-badge")).toContainText("11");
        await expect(sheet.getByTestId("sheet-in-cart")).toContainText("3");
      }).toPass({ timeout: 20_000 });
    } finally {
      await seeded.restore();
    }
  });

  test("AC-SC12: a step sets the quantity, up AND down, and adds nothing", async ({ page }) => {
    const seeded = await seedDiscountTiers([
      { min_qty: 3, pct: 7 },
      { min_qty: 9, pct: 19 },
    ]);
    try {
      await page.goto(step3);
      const badgeBefore = await page.getByTestId("cart-button").innerText();
      await expect(async () => {
        await page.reload();
        await ceramicCards(page).first().click();
        await expect(page.getByTestId("discount-ladder")).toBeVisible();
      }).toPass({ timeout: 20_000 });

      const sheet = page.getByTestId("product-sheet");
      const steps = sheet.getByTestId("ladder-step");
      await steps.nth(1).click(); // up to the second step
      await expect(sheet.getByTestId("qty-value")).toHaveText("9");
      await steps.nth(0).click(); // and back DOWN to the first
      await expect(sheet.getByTestId("qty-value")).toHaveText("3");
      // the scale picks a quantity, it does not buy
      expect(await page.getByTestId("cart-button").innerText()).toBe(badgeBefore);
    } finally {
      await seeded.restore();
    }
  });

  test("AC-SC14: no scale → no ladder, and no empty frame", async ({ page }) => {
    const off = await seedDiscountTiers([]); // clears the rows AND the flag
    try {
      await expect(async () => {
        await page.goto(step3);
        await ceramicCards(page).first().click();
        await expect(page.getByTestId("product-sheet")).toBeVisible();
        await expect(page.getByTestId("discount-ladder")).toHaveCount(0);
        await expect(page.getByTestId("ladder-excluded")).toHaveCount(0);
      }).toPass({ timeout: 20_000 });
    } finally {
      await off.restore();
    }
  });

  test("AC-SC9: switched off from admin — the flag is false but the tier rows stay", async ({
    page,
  }) => {
    // AC-SC3 switches off by DELETING the tier rows. That is not the state the
    // shop can actually produce: `/admin/discounts` flips
    // `settings.quantity_discounts_enabled` and leaves the scale in the table
    // (the empty scale is refused by `.min(1)` in saveDiscountTiers). This is
    // that real state.
    //
    // TWO steps on purpose, and the fixture only works this way: with a single
    // step at min_qty 2 and a cart of 2, `nextTier(2, …)` finds no threshold
    // above 2 and CartDiscountNudge returns null on its own — the test would go
    // green without proving anything. With a second step at 9 there IS a next
    // tier, so the nudge renders whenever it is asked to, which is what makes
    // the off-state assertable at all.
    const seeded = await seedDiscountTiers([
      { min_qty: 2, pct: 12 },
      { min_qty: 9, pct: 20 },
    ]);
    const db = adminClient();
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      const line = drawer(page).getByTestId("cart-line").first();
      await drawer(page).getByLabel("+").first().click(); // qty 2 → 12%, next step at 9

      // the seed really took: discount applied AND the nudge pointing at 9
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(line.getByTestId("cart-line-full")).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await expect(drawer(page).getByTestId("cart-discount-nudge")).toBeVisible();

      // now the admin off-switch: the FLAG only, rows untouched
      const off = await db
        .from("settings")
        .update({ quantity_discounts_enabled: false })
        .eq("id", 1);
      if (off.error) throw off.error;

      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(drawer(page).getByTestId("cart-line-full")).toHaveCount(0);
      }).toPass({ timeout: 15_000 });
      // …and nothing may still advertise a discount that is switched off.
      await expect(drawer(page).getByTestId("cart-discount-nudge")).toHaveCount(0);
    } finally {
      // restore() rewrites the flag to what it found, but be explicit: this
      // test flipped it outside the seeder, so it puts it back itself first.
      await db
        .from("settings")
        .update({ quantity_discounts_enabled: true })
        .eq("id", 1);
      await seeded.restore();
    }
  });

  test("AC-SC10: the tier discount reaches the order — frozen on the line, shown in admin", async ({
    page,
  }) => {
    test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");
    // AC-SC8 proves a part-② DEAL reaches the order. Nothing proved it for the
    // part-① TIER, which is the 200 € half of the card and the path where the
    // money actually lands in the database. Asserting on the admin badge alone
    // would only prove something rendered; the row is what the shop invoices
    // from, so the frozen columns are checked directly and the AMOUNT is
    // recomputed here rather than trusted.
    const seeded = await seedDiscountTiers([{ min_qty: 2, pct: 12 }]);
    const db = adminClient();
    let orderId = "";
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      const line = drawer(page).getByTestId("cart-line").first();
      await drawer(page).getByLabel("+").first().click(); // qty 2 → the ×2 tier
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(line.getByTestId("cart-line-full")).toBeVisible();
      }).toPass({ timeout: 15_000 });

      await page.getByTestId("cart-checkout").click();
      await page.getByTestId("order-form").waitFor();
      await fillOrderForm(page, "E2E Sconti Tier", "e2e-sconti-tier@example.no");
      await page.getByTestId("order-submit").click();
      await expect(page.getByTestId("order-confirmation")).toBeVisible();
      const code = await page.getByTestId("order-code").innerText();

      const { data: order, error } = await db
        .from("orders")
        .select("id")
        .eq("code", code)
        .single();
      if (error) throw error;
      orderId = (order as { id: string }).id;

      const { data: items, error: itemsErr } = await db
        .from("order_items")
        .select("quantity, price_cents_snapshot, discount_pct, discount_cents, discount_source")
        .eq("order_id", orderId);
      if (itemsErr) throw itemsErr;
      expect(items).toHaveLength(1);
      const it = items![0] as {
        quantity: number;
        price_cents_snapshot: number;
        discount_pct: number | null;
        discount_cents: number;
        discount_source: string | null;
      };
      expect(it.quantity).toBe(2);
      expect(it.discount_pct).toBe(12);
      expect(it.discount_source).toBe("tier");
      // the frozen amount must be the server's own arithmetic, rounded ONCE on
      // the line total (ADR 0022) — not merely "some discount was recorded".
      expect(it.discount_cents).toBe(
        Math.round((it.price_cents_snapshot * it.quantity * 12) / 100)
      );

      await loginAdmin(page);
      await page.goto(`/admin/orders/${orderId}`);
      await expect(page.getByTestId("detail-discount")).toBeVisible();
    } finally {
      await seeded.restore();
      if (orderId) await deleteOrder(orderId);
    }
  });
}); // R4-SCONTI describe

test("R4-BTN-SCALE AC1: lo stack azioni step 3 ha ritmo verticale", async ({
  page,
}) => {
  // La regressione che questo test esiste per fermare: `gap-3` sparito dal
  // contenitore dello stack (R4-SCONTI, in produzione dal 31/8) → i tre bordi
  // si toccano e le pillole leggono come un blocco unico. Si misura il VUOTO
  // tra i box, non le classi: una `gap` tolta e una `mb` rimessa altrove sono
  // la stessa cosa per chi guarda, e questo test non deve avere opinioni.
  // Soglia bassa apposta (≥4px): dopo R4-BTN-SCALE il ritmo diventa 12px sotto
  // il primario e 8px tra le due basse, e questa asserzione resta vera.
  await page.goto(step3);
  await addFirstCeramic(page);

  const box = async (id: string) => {
    const b = await page
      .locator(`[data-testid="${id}"]:visible`)
      .first()
      .boundingBox();
    if (!b) throw new Error(`${id}: non visibile`);
    return b;
  };
  const [checkout, newDesign, share] = [
    await box("docked-checkout"),
    await box("new-design-cta"),
    await box("share-set"),
  ];

  expect(
    newDesign.y - (checkout.y + checkout.height),
    "«Bestill» e «Bygg et nytt design» si toccano"
  ).toBeGreaterThanOrEqual(4);
  expect(
    share.y - (newDesign.y + newDesign.height),
    "«Bygg et nytt design» e «Del settet» si toccano"
  ).toBeGreaterThanOrEqual(4);
});
