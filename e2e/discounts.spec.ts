import { test, expect, type Page } from "@playwright/test";
import {
  ADMIN_READY,
  CAN_SEED,
  addFirstCeramic,
  adminClient,
  ceramicCards,
  deleteOrder,
  firstProductOfDesignSupplier,
  loginAdmin,
  seedDiscountRule,
  seedDiscountTiers,
  sweepE2EDiscounts,
} from "./helpers";

/**
 * R4-SCONTI ② — automations & upsell (ADR 0023). Its own spec file rather
 * than growing cart.spec.ts: it needs a seeded rule AND two products of the
 * SAME supplier (D2), heavier setup than a core journey should carry. Runs
 * inside `make run-e2e` (the full suite), not `make run-e2e-core` — part ②
 * is deliberately not a per-PR gate (Makefile CORE_SPECS is unchanged).
 *
 * The whole file seeds, so the guard sits once, in a `beforeEach`, rather
 * than per test. Two conditions gate it, not one:
 *  - CAN_SEED (MK_E2E_SEED=1 + the project-ref allowlist, e2e/helpers.ts:103)
 *  - migration 0034 (discount_rules / discount_rule_products) actually
 *    applied — it is applied NOWHERE at the time this file was written (see
 *    task-15-brief.md "State of the world"), so this spec is expected to
 *    skip, declared, until the PM pushes it. A plain CAN_SEED check is not
 *    enough: `seedDiscountRule` would otherwise attempt a real INSERT into a
 *    table that does not exist and FAIL (42P01) instead of SKIPPING, which
 *    Global Constraints forbids.
 *
 * `testInfo.skip()` inside `beforeEach` (not a bare `test.skip()` at the top
 * of the file) is what lets the second condition — only knowable after an
 * async DB probe — gate every test declaratively in one place. `beforeAll`
 * computes both the probe result and (only once it holds) the trigger/
 * suggested product pair the whole file reuses; `beforeEach` reads those
 * already-computed values back into a skip.
 */

let step3 = "";
let triggerProductId = "";
let suggestedProductId = "";
let hasRulesTable = false;

/** `discount_rules` is migration 0034, applied on neither DB yet (Makefile:60-77,
 *  GLOBAL-CONSTRAINTS.md). 42P01 → the table is missing: a declared skip, never a
 *  failure (lezione F07). Any OTHER error is logged and treated as "ready", so
 *  the suite fails loudly instead of skipping for the wrong reason — mirrors
 *  `probeRulesApplied` in src/app/admin/discounts/actions.integration.test.ts. */
async function probeRulesTable(): Promise<boolean> {
  const { error } = await adminClient().from("discount_rules").select("id").limit(1);
  if (error) {
    if (error.code === "42P01") return false;
    console.warn(
      "[e2e discounts] unexpected error probing discount_rules — running anyway so it fails loudly instead of skipping for the wrong reason:",
      error
    );
    return true;
  }
  return true;
}

test.beforeAll(async () => {
  if (!CAN_SEED) return; // beforeEach skips every test either way; avoid the DB round trip

  // A previous run that got killed mid-test (SIGKILL, OOM, a cancelled CI
  // job) can leave a stray "e2e-tmp-rule-…" live with automations_enabled
  // still on, or a leftover test tier scale — staging serves the real public
  // site, so this cleans up after that BEFORE anything else in this file
  // seeds a thing. Safe to call with nothing to clean (e2e/helpers.ts).
  await sweepE2EDiscounts();

  hasRulesTable = await probeRulesTable();
  if (!hasRulesTable) return;

  // Resilient discovery (never hardcode slugs/ids, e2e/helpers.ts:41 onward):
  // the first active design whose supplier has at least two VISIBLE products
  // — the first is what `addFirstCeramic` clicks (via `firstProductOfDesignSupplier`,
  // the same whitelist-aware lookup step 3 itself uses), the second becomes
  // the rule's suggested product. Same shape as actions.integration.test.ts's
  // own supplier-pair discovery, but design-anchored so `step3` and the
  // trigger product agree with what the page actually renders.
  const db = adminClient();
  const { data: designs, error } = await db
    .from("designs")
    .select("id, slug, supplier_id")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;

  for (const design of designs ?? []) {
    const trigger = await firstProductOfDesignSupplier(design.id, design.supplier_id);
    if (!trigger) continue;
    const { data: candidates, error: prodErr } = await db
      .from("products")
      .select("id")
      .eq("supplier_id", design.supplier_id)
      .eq("visible", true)
      .neq("id", trigger.id)
      .order("sort_order")
      .limit(1);
    if (prodErr) throw prodErr;
    if (candidates && candidates.length > 0) {
      step3 = `/no/configurator?design=${design.slug}&step=3`;
      triggerProductId = trigger.id;
      suggestedProductId = candidates[0].id;
      return;
    }
  }
  throw new Error(
    "R4-SCONTI e2e: no active design's supplier has two visible products — cannot seed a rule (D2)."
  );
});

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(
    !CAN_SEED,
    "MK_E2E_SEED=1 richiesto: la spec semina una regola di automation nel catalogo reale"
  );
  testInfo.skip(
    !hasRulesTable,
    "migration 0034 (discount_rules / discount_rule_products) non applicata su questo DB: skip dichiarato finché il PM non fa `make db-push-staging` (vedi Makefile:60-77)"
  );
});

test.describe.configure({ timeout: 60_000 }); // config.server.ts caches for up to revalidate:10s — polling can eat the default 30s budget

const openCart = (page: Page) => page.getByTestId("cart-button").click();
// Step-3 docked panels duplicate the cart testids → scope queries to the drawer.
const drawer = (page: Page) => page.getByTestId("cart-drawer");

test("AC-SC4: the suggestion appears at the threshold, shows both prices, and adds the ceramic", async ({
  page,
}) => {
  // suggestedQty 2: the card prices the WHOLE offer (unit × 2), so it must name
  // the quantity or a 350 kr plate reads as quoted at 700 kr for no reason.
  const seeded = await seedDiscountRule({
    triggerProductId,
    suggestedProductId,
    minQty: 2,
    pct: 15,
    suggestedQty: 2,
  });
  try {
    await page.goto(step3);
    await addFirstCeramic(page);
    await openCart(page);
    await expect(drawer(page).getByTestId("cart-suggestion")).toHaveCount(0); // one piece: below the threshold

    await drawer(page).getByLabel("+").first().click(); // qty 2 → reach the threshold
    const card = drawer(page).getByTestId("cart-suggestion");
    await expect(async () => {
      await page.reload();
      await openCart(page);
      await expect(card).toBeVisible();
    }).toPass({ timeout: 15_000 });

    await expect(card.getByTestId("cart-suggestion-full")).toBeVisible(); // full price, struck through
    await expect(card.getByTestId("cart-suggestion-net")).toBeVisible(); // discounted price
    await expect(card).toContainText("2 ×"); // the offer's quantity is on screen
    await card.getByTestId("cart-suggestion-add").click();
    await expect(drawer(page).getByTestId("cart-line")).toHaveCount(2);
    // Gone: the offer has been taken IN FULL (D1, ADR 0025 — it used to be
    // "the suggested product is in the cart"). The trigger group holds 2 at
    // full price, so the rule affords exactly one application of 2 pieces.
    await expect(card).toHaveCount(0);
    await expect(drawer(page).getByTestId("cart-deal-total")).toBeVisible();
  } finally {
    await seeded.restore();
  }
});


test("AC-SC13: the offer comes up AFTER the add, and adds only the suggestion", async ({
  page,
}) => {
  // R4-UPSELL-POST-ADD: this used to assert «Legg til 4+2» inside the sheet —
  // the base plus the offer, in one button. The offer no longer lives in the
  // sheet at all: the customer adds their four, the sheet closes, and the panel
  // comes up with the base already in the basket. So the button adds ONE thing,
  // and the two-number label it used to carry cannot exist any more.
  const seeded = await seedDiscountRule({
    triggerProductId,
    suggestedProductId,
    minQty: 4,
    pct: 20,
    suggestedQty: 2,
  });
  try {
    await page.goto(step3);
    const sheet = page.getByTestId("product-sheet");
    const panel = page.getByTestId("added-sheet");
    await expect(async () => {
      await page.reload();
      await ceramicCards(page).first().click();
      await expect(sheet).toBeVisible();
      await sheet.getByTestId("qty-inc").click(); // 2
      await sheet.getByTestId("qty-inc").click(); // 3
      await sheet.getByTestId("qty-inc").click(); // 4 → the rule will fire
      // AC7: no offer anywhere in the sheet, at any quantity.
      await expect(sheet.getByTestId("sheet-offer")).toHaveCount(0);
      await sheet.getByTestId("add-to-cart").click();
      await expect(panel).toBeVisible();
    }).toPass({ timeout: 20_000 });

    // The sheet is gone — two dialogs in sequence, never one inside the other.
    await expect(sheet).toBeHidden();
    await expect(panel.getByTestId("sheet-offer-row")).toHaveCount(1);
    // The confirmation names what was added; the card names what is on offer.
    await expect(panel.getByTestId("added-sheet-line")).toContainText("4");
    const add = panel.getByTestId("sheet-offer-add");
    await expect(add).toContainText("2"); // the offer's own price, and nothing else
    await expect(add).not.toContainText("4+2");
    await expect(add).not.toContainText("4+1");

    await add.click();
    // The panel does NOT close: the customer may want the other cards too.
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("sheet-offer-taken")).toBeVisible();
    await expect(panel.getByTestId("sheet-offer-add")).toHaveCount(0);
    await expect(page.getByTestId("cart-badge")).toHaveText("6"); // 4 + 2

    // Only «Fortsett å handle» closes it.
    await panel.getByTestId("added-sheet-continue").click();
    await expect(panel).toBeHidden();
  } finally {
    await seeded.restore();
  }
});

test("AC-SC6b: an add that unlocks nothing gets the toast, and no panel", async ({ page }) => {
  // The other half of the rule: below the threshold the offer does not exist on
  // screen at all — no dimmed card, no «add 3 more». Just the §3.20 toast.
  const seeded = await seedDiscountRule({
    triggerProductId,
    suggestedProductId,
    minQty: 4,
    pct: 20,
    suggestedQty: 2,
  });
  try {
    await page.goto(step3);
    const sheet = page.getByTestId("product-sheet");
    await expect(async () => {
      await page.reload();
      await ceramicCards(page).first().click();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId("discount-ladder")).toBeVisible();
    }).toPass({ timeout: 20_000 });

    await sheet.getByTestId("add-to-cart").click(); // one piece: nowhere near 4
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("added-sheet")).toHaveCount(0);
    await expect(page.getByTestId("add-toast")).toBeVisible();
  } finally {
    await seeded.restore();
  }
});

test("AC-SC15: same-product upsell — offered once, and taking it unlocks no more", async ({
  page,
}) => {
  // The rule R4-SCONTI-2 makes expressible: «buy 4, take 4 more at half price».
  // The point of the test is the invariant — the four discounted pieces must not
  // re-trigger the rule (4 → 8 → 16).
  const seeded = await seedDiscountRule({
    triggerProductId,
    suggestedProductId: triggerProductId,
    minQty: 4,
    pct: 50,
    suggestedQty: 4,
  });
  try {
    await page.goto(step3);
    const sheet = page.getByTestId("product-sheet");
    const panel = page.getByTestId("added-sheet");
    await expect(async () => {
      await page.reload();
      await ceramicCards(page).first().click();
      await expect(sheet).toBeVisible();
      for (let i = 0; i < 3; i++) await sheet.getByTestId("qty-inc").click(); // 4
      await sheet.getByTestId("add-to-cart").click();
      await expect(panel).toBeVisible();
    }).toPass({ timeout: 20_000 });

    await panel.getByTestId("sheet-offer-add").click();
    await expect(panel.getByTestId("sheet-offer-taken")).toBeVisible();
    // 4 full price + 4 discounted, and NO second offer: the discounted pieces
    // count for no pool at all (ADR 0025).
    await expect(page.getByTestId("cart-badge")).toHaveText("8");
    await expect(panel.getByTestId("sheet-offer-add")).toHaveCount(0);
    await expect(panel.getByTestId("sheet-offer-row")).toHaveCount(1);
  } finally {
    await seeded.restore();
  }
});

test("AC-SC5: the ✕ closes the whole block, and it does not come back", async ({ page }) => {
  // Semantics changed with the list (2026-08-31): the ✕ used to discard ONE
  // offer to reveal the next — that is the behaviour the list replaced. It now
  // closes the block. Two rules, so "closed the block" is distinguishable from
  // "closed the first offer".
  const ruleA = await seedDiscountRule({
    triggerProductId,
    suggestedProductId,
    minQty: 1,
    pct: 10,
  });
  try {
    const ruleB = await seedDiscountRule({
      triggerProductId,
      suggestedProductId,
      minQty: 1,
      pct: 20,
    });
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      const block = drawer(page).getByTestId("cart-suggestion");
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(block).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await expect(block.getByTestId("cart-suggestion-row")).toHaveCount(2);

      await block.getByTestId("cart-suggestion-dismiss").click();
      // the BLOCK is gone — not one row of it
      await expect(block).toHaveCount(0);

      // Session-scoped (never persisted, cart-context.tsx), not reload-scoped:
      // still gone after closing and reopening the drawer within the same page.
      await page.keyboard.press("Escape");
      await expect(drawer(page)).toBeHidden();
      await openCart(page);
      await expect(drawer(page).getByTestId("cart-suggestion")).toHaveCount(0);
    } finally {
      await ruleB.restore();
    }
  } finally {
    await ruleA.restore();
  }
});


test("AC-SC6: several offers, ONE block, and still never a dialog", async ({ page }) => {
  // The spec changed on 2026-08-31: offers are a LIST, capped at
  // MAX_SUGGESTIONS, not one card at a time. What this test defends is what
  // survived that change — the offers live in a SINGLE block, and the block is
  // never a dialog. Both rules trigger on presence (minQty 1) so the list has
  // more than one row without needing four products of one supplier.
  //
  // The CAP itself is unit-tested (discount.test.ts, mutation-checked): proving
  // it here would need four distinct visible products under one supplier, which
  // this catalogue cannot promise, and a test that skips on catalogue shape
  // defends nothing.
  const ruleA = await seedDiscountRule({
    triggerProductId,
    suggestedProductId,
    minQty: 1,
    pct: 10,
  });
  try {
    const ruleB = await seedDiscountRule({
      triggerProductId,
      suggestedProductId,
      minQty: 1,
      pct: 20,
    });
    try {
      await page.goto(step3);
      await addFirstCeramic(page); // qty 1 already meets minQty:1 for BOTH rules
      await openCart(page);
      const block = drawer(page).getByTestId("cart-suggestion");
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(block).toBeVisible();
      }).toPass({ timeout: 15_000 });

      // one block…
      await expect(block).toHaveCount(1);
      // …holding both offers, each its own row
      await expect(block.getByTestId("cart-suggestion-row")).toHaveCount(2);
      // …with a single ✕ for the lot
      await expect(block.getByTestId("cart-suggestion-dismiss")).toHaveCount(1);
      // The drawer itself is a Radix Sheet (= a dialog, by design) — the
      // assertion here is that the offers did not add a SECOND one.
      await expect(page.getByRole("dialog")).toHaveCount(1);
    } finally {
      await ruleB.restore();
    }
  } finally {
    await ruleA.restore();
  }
});


test("AC-SC7: a fixed deal survives the tiers being switched off", async ({ page }) => {
  const off = await seedDiscountTiers([]); // tiers explicitly OFF (also clears the flag)
  try {
    const seeded = await seedDiscountRule({
      triggerProductId,
      suggestedProductId,
      minQty: 2,
      pct: 15,
      suggestedQty: 2,
    });
    try {
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      await drawer(page).getByLabel("+").first().click(); // qty 2 → the deal's own threshold
      const card = drawer(page).getByTestId("cart-suggestion");
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(card).toBeVisible();
      }).toPass({ timeout: 15_000 });

      await card.getByTestId("cart-suggestion-add").click();
      const dealTotal = drawer(page).getByTestId("cart-deal-total");
      await expect(dealTotal).toBeVisible();
      await expect(drawer(page).getByTestId("cart-discount-total")).toHaveCount(0); // no tier row: tiers are off

      // The offer covers suggestedQty pieces and no more (ADR 0023). Grow the
      // deal line past it: the saving must NOT move, and the badge must stop
      // claiming a line-wide percentage.
      const dealLine = drawer(page).getByTestId("cart-line").last();
      const savedBefore = await dealTotal.innerText();
      await dealLine.getByLabel("+").click();
      await expect(dealLine.getByTestId("cart-discount-badge")).toContainText("2");
      await expect(dealTotal).toHaveText(savedBefore);
    } finally {
      await seeded.restore();
    }
  } finally {
    await off.restore();
  }
});

test("AC-SC8: the deal reaches the order — admin detail shows the discount", async ({ page }) => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");
  const seeded = await seedDiscountRule({
    triggerProductId,
    suggestedProductId,
    minQty: 2,
    pct: 15,
  });
  let orderId = "";
  try {
    await page.goto(step3);
    await addFirstCeramic(page);
    await openCart(page);
    await drawer(page).getByLabel("+").first().click(); // reach the threshold
    const card = drawer(page).getByTestId("cart-suggestion");
    await expect(async () => {
      await page.reload();
      await openCart(page);
      await expect(card).toBeVisible();
    }).toPass({ timeout: 15_000 });
    await card.getByTestId("cart-suggestion-add").click();
    await expect(drawer(page).getByTestId("cart-line")).toHaveCount(2);

    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("order-form").waitFor();
    await page.getByTestId("order-name").fill("E2E Sconti");
    await page.getByTestId("order-email").fill("e2e-sconti@example.no");
    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-confirmation")).toBeVisible();
    const code = await page.getByTestId("order-code").innerText();

    const db = adminClient();
    const { data: order, error } = await db
      .from("orders")
      .select("id")
      .eq("code", code)
      .single();
    if (error) throw error;
    orderId = (order as { id: string }).id;

    await loginAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId("detail-discount")).toBeVisible();
  } finally {
    await seeded.restore();
    if (orderId) await deleteOrder(orderId);
  }
});
