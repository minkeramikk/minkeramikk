import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  ADMIN_READY,
  CAN_SEED,
  adminClient,
  addFirstCeramic,
  ceramicCards,
  deleteOrder,
  firstActiveDesign,
  firstProductOfDesignSupplier,
  loadEnvLocal,
  loginAdmin,
  seedDiscountRule,
  seedDiscountTiers,
  seedOrder,
  type SeededOrder,
} from "./helpers";

/**
 * R4-SCONTI evidence (tooling, NOT a gate) — the shots part ① needs before the
 * PR: the customer cart with a tier struck through and the nudge, the step-3
 * docked panel at both breakpoints (Task 4's 12px→8px internal spacing change
 * has never been screenshotted, in either environment), the admin Discounts &
 * Upsell settings page, and an admin order that actually carries a discount —
 * totals block, ratified badge, ratify toggle (Task 8's whole discounted
 * rendering path has never been observed anywhere before this).
 *
 * Everything customer-facing runs against the LIVE discount config, seeded
 * for the duration of one test and restored in a `finally` (same guard as
 * cart.spec.ts's AC-SC tests: CAN_SEED, declared skip — this writes to the
 * catalogue the public site serves). The admin order is seeded, given a
 * discount directly on its `order_items` row (no RPC — see helpers.ts), and
 * deleted at the end. No real customer ever appears in a screenshot.
 *
 * Run: npx playwright test e2e/r4-sconti-evidence.spec.ts --project=evidence
 */
loadEnvLocal();
const OUT = "docs/evidence/r4-sconti";
mkdirSync(OUT, { recursive: true });

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

const openCart = (page: Page) => page.getByTestId("cart-button").click();
const drawer = (page: Page) => page.getByTestId("cart-drawer");

/**
 * R4-SCONTI ② evidence — needs migration 0034 (discount_rules /
 * discount_rule_products) applied, which is on NEITHER database at the time
 * this file was written (task-15-brief.md "State of the world"). Mirrors
 * `probeRulesTable` in discounts.spec.ts and `probeRulesApplied` in
 * actions.integration.test.ts: 42P01 → a declared skip, never a failure
 * (lezione F07); any other error is logged and treated as "ready" so the
 * suite fails loudly instead of skipping for the wrong reason.
 */
async function probeRulesTable(): Promise<boolean> {
  const { error } = await adminClient().from("discount_rules").select("id").limit(1);
  if (error) {
    if (error.code === "42P01") return false;
    console.warn(
      "[e2e evidence] unexpected error probing discount_rules — running anyway so it fails loudly instead of skipping for the wrong reason:",
      error
    );
    return true;
  }
  return true;
}

/**
 * Resilient discovery (never hardcode slugs/ids): the first active design
 * whose supplier has at least two VISIBLE products — the first is what
 * `addFirstCeramic` clicks (via `firstProductOfDesignSupplier`, the same
 * whitelist-aware lookup step 3 itself uses), the second becomes the rule's
 * suggested product (D2: same supplier). Null when no active design's
 * supplier has two.
 */
async function discoverTriggerAndSuggested(): Promise<{
  step3: string;
  triggerProductId: string;
  suggestedProductId: string;
} | null> {
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
      return {
        step3: `/no/configurator?design=${design.slug}&step=3`,
        triggerProductId: trigger.id,
        suggestedProductId: candidates[0].id,
      };
    }
  }
  return null;
}

test.describe("admin: Discounts & Upsell settings page", () => {
  test("admin-discounts (1280 + 390)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginAdmin(page);
    await page.goto("/admin/discounts");
    await expect(page.getByRole("heading", { name: "Discounts & Upsell" })).toBeVisible();
    await page.screenshot({ path: `${OUT}/admin-discounts-1280.png`, fullPage: true });

    await page.setViewportSize(PHONE);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Discounts & Upsell" })).toBeVisible();
    await page.screenshot({ path: `${OUT}/admin-discounts-390.png`, fullPage: true });
  });
});

test.describe("customer cart: tiers, strikethrough, nudge, docked panel", () => {
  test.skip(
    !CAN_SEED,
    "MK_E2E_SEED=1 richiesto: il test semina la scala sconti nel catalogo reale"
  );
  test.describe.configure({ timeout: 60_000 }); // polling can eat the default 30s budget

  let step3 = "";
  test.beforeAll(async () => {
    const design = await firstActiveDesign();
    step3 = `/no/configurator?design=${design.slug}&step=3`;
  });

  test("cart-tiers + docked panel (390 + 1280), nudge (390)", async ({ page }) => {
    // config.server.ts caches the discount config for up to `revalidate: 10`
    // seconds — reload-and-retry (toPass) instead of a single check, at every
    // checkpoint, so a screenshot is never taken against a still-stale read.
    const seeded = await seedDiscountTiers([{ min_qty: 2, pct: 12 }]);
    try {
      // ── 390: one piece → nudge only ──────────────────────────────────────
      await page.setViewportSize(PHONE);
      await page.goto(step3);
      await addFirstCeramic(page);
      await openCart(page);
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(drawer(page).getByTestId("cart-discount-nudge")).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await page.screenshot({ path: `${OUT}/cart-nudge-390.png` });
      await page.keyboard.press("Escape");
      await expect(drawer(page)).toBeHidden();

      // ── 390: bump to the first tier via the docked (mobile) panel — this
      // is the panel Task 4 touched and no one has looked at since ──────────
      const dockedMobile = page.getByTestId("mobile-cart-section");
      await dockedMobile.getByLabel("+").first().click(); // qty 2 → 12%
      await expect(dockedMobile.getByTestId("cart-discount-badge")).toBeVisible();
      await dockedMobile.screenshot({ path: `${OUT}/docked-cart-tiers-390.png` });

      await openCart(page);
      await expect(drawer(page).getByTestId("cart-line-full")).toBeVisible();
      await page.screenshot({ path: `${OUT}/cart-tiers-390.png` });
      await page.keyboard.press("Escape");
      await expect(drawer(page)).toBeHidden();

      // ── 1280: drawer + docked panel, both discounted ─────────────────────
      await page.setViewportSize(DESKTOP);
      await page.goto(step3);
      await addFirstCeramic(page);
      const dockedDesktop = page.getByTestId("docked-cart-panel");
      await dockedDesktop.getByLabel("+").first().click(); // qty 2 → 12%
      await expect(async () => {
        await page.reload();
        await expect(dockedDesktop.getByTestId("cart-discount-badge")).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await dockedDesktop.screenshot({ path: `${OUT}/docked-cart-tiers-1280.png` });

      await openCart(page);
      await expect(drawer(page).getByTestId("cart-line-full")).toBeVisible();
      await page.screenshot({ path: `${OUT}/cart-tiers-1280.png` });
    } finally {
      await seeded.restore();
    }
  });
});

test.describe("customer cart: suggestion card (part ②)", () => {
  // Two conditions gate this describe, not one: CAN_SEED (declared skip,
  // lezione F07) AND migration 0034 actually applied — it is applied on
  // NEITHER database at the time this file was written (task-15-brief.md
  // "State of the world"), so a plain CAN_SEED check is not enough: seeding
  // a rule would attempt a real INSERT into a table that does not exist and
  // FAIL (42P01) instead of SKIPPING. `testInfo.skip()` inside `beforeEach`
  // (not a bare `test.skip()`) is what lets the async table probe gate every
  // test in this describe declaratively, same idiom as discounts.spec.ts.
  test.describe.configure({ timeout: 60_000 }); // polling can eat the default 30s budget

  let hasRulesTable = false;
  let ruleStep3 = "";
  let triggerProductId = "";
  let suggestedProductId = "";

  test.beforeAll(async () => {
    if (!CAN_SEED) return;
    hasRulesTable = await probeRulesTable();
    if (!hasRulesTable) return;
    const found = await discoverTriggerAndSuggested();
    if (!found) return;
    ({ step3: ruleStep3, triggerProductId, suggestedProductId } = found);
  });

  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(
      !CAN_SEED,
      "MK_E2E_SEED=1 richiesto: il test semina una regola di automation nel catalogo reale"
    );
    testInfo.skip(
      !hasRulesTable,
      "migration 0034 (discount_rules) non applicata su questo DB: skip dichiarato finché il PM non fa `make db-push-staging`"
    );
  });

  test("suggestion-390 + suggestion-1280 + suggestion-added-1280", async ({ page }) => {
    const seeded = await seedDiscountRule({
      triggerProductId,
      suggestedProductId,
      minQty: 2,
      pct: 15,
    });
    try {
      // ── 390: the suggestion card, full price struck through beside the
      // discounted one ──────────────────────────────────────────────────
      await page.setViewportSize(PHONE);
      await page.goto(ruleStep3);
      await addFirstCeramic(page);
      await openCart(page);
      await drawer(page).getByLabel("+").first().click(); // reach the threshold
      const cardPhone = drawer(page).getByTestId("cart-suggestion");
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(cardPhone).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await page.screenshot({ path: `${OUT}/suggestion-390.png` });

      // ── 1280: same card, desktop drawer ─────────────────────────────────
      await page.setViewportSize(DESKTOP);
      await page.goto(ruleStep3);
      await addFirstCeramic(page);
      await openCart(page);
      await drawer(page).getByLabel("+").first().click();
      const cardDesktop = drawer(page).getByTestId("cart-suggestion");
      await expect(async () => {
        await page.reload();
        await openCart(page);
        await expect(cardDesktop).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await page.screenshot({ path: `${OUT}/suggestion-1280.png` });

      // ── after accepting: the deal line + the deal total ──────────────────
      await cardDesktop.getByTestId("cart-suggestion-add").click();
      await expect(drawer(page).getByTestId("cart-line")).toHaveCount(2);
      await expect(drawer(page).getByTestId("cart-deal-total")).toBeVisible();
      await page.screenshot({ path: `${OUT}/suggestion-added-1280.png` });
    } finally {
      await seeded.restore();
    }
  });
});

test.describe("admin: Automations rules panel (part ②)", () => {
  let hasRulesTable = false;
  let triggerProductId = "";
  let suggestedProductId = "";

  test.beforeAll(async () => {
    if (!CAN_SEED) return;
    hasRulesTable = await probeRulesTable();
    if (!hasRulesTable) return;
    const found = await discoverTriggerAndSuggested();
    if (!found) return;
    triggerProductId = found.triggerProductId;
    suggestedProductId = found.suggestedProductId;
  });

  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(
      !CAN_SEED,
      "MK_E2E_SEED=1 richiesto: il test semina una regola di automation nel catalogo reale"
    );
    testInfo.skip(
      !hasRulesTable,
      "migration 0034 (discount_rules) non applicata su questo DB: skip dichiarato finché il PM non fa `make db-push-staging`"
    );
  });

  test("admin-rules (1280 + 390)", async ({ page }) => {
    // A seeded rule so the panel shows an actual rule card, not an empty list.
    const seeded = await seedDiscountRule({
      triggerProductId,
      suggestedProductId,
      minQty: 2,
      pct: 15,
    });
    try {
      await page.setViewportSize(DESKTOP);
      await loginAdmin(page);
      await page.goto("/admin/discounts");
      const panel = page.getByTestId("rules-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId("rule-card")).toHaveCount(1);
      await panel.screenshot({ path: `${OUT}/admin-rules-1280.png` });

      await page.setViewportSize(PHONE);
      await page.reload();
      await expect(panel).toBeVisible();
      await panel.screenshot({ path: `${OUT}/admin-rules-390.png` });
    } finally {
      await seeded.restore();
    }
  });
});

test.describe("admin: an order that actually carries a discount", () => {
  let seeded: SeededOrder;
  test.beforeAll(async () => {
    seeded = await seedOrder("MK-R4SC-EV");
    const db = adminClient();
    // A realistic code: the seeder's timestamped one is far longer than any
    // real MK-XXXX and would dominate the 1280 shot.
    await db.from("orders").update({ code: "MK-R4SCEV" }).eq("id", seeded.orderId);
    seeded.code = "MK-R4SCEV";
    // The seeded item is 2 × 50000 = 100000 subtotal; freeze a 10% tier
    // discount directly on the line (Task 8's frozen-snapshot path, ADR 0022)
    // — no need for the replace_* RPCs the cart never uses either.
    const upd = await db
      .from("order_items")
      .update({ discount_pct: 10, discount_cents: 10000, discount_source: "tier" })
      .eq("order_id", seeded.orderId);
    if (upd.error) throw upd.error;
  });
  test.afterAll(async () => {
    await deleteOrder(seeded?.orderId ?? "");
  });

  test("admin-order-discount + admin-ratify + admin-order-deal (1280)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginAdmin(page);
    await page.goto(`/admin/orders/${seeded.orderId}`);

    // full page: totals block (subtotal/discount/total) + the ratify section,
    // both in frame — the whole discounted rendering path in one shot.
    await expect(page.getByTestId("detail-discount")).toBeVisible();
    await page.screenshot({ path: `${OUT}/admin-order-discount-1280.png`, fullPage: true });

    // tighter close-up: the Payment & shipping section, badge + ratify toggle.
    const paymentSection = page.getByTestId("ratify-form").locator("xpath=ancestor::section[1]");
    await expect(paymentSection.getByTestId("discount-badge")).toBeVisible();
    await paymentSection.screenshot({ path: `${OUT}/admin-ratify-1280.png` });

    // R4-SCONTI ② — the SAME order, its discount reclassified as a fixed DEAL
    // (order_items.discount_source is a free-text column from migration
    // 0032, so this needs no dependency on 0034 at all). The admin detail
    // renders identically either way — orderDiscount() sums the frozen cents
    // regardless of source — which is itself the point: the shop owner sees
    // ONE "Discount" line, not two different UIs to learn depending on where
    // the deal came from.
    const upd = await adminClient()
      .from("order_items")
      .update({ discount_source: "deal" })
      .eq("order_id", seeded.orderId);
    if (upd.error) throw upd.error;
    await page.reload();
    await expect(page.getByTestId("detail-discount")).toBeVisible();
    await page.screenshot({ path: `${OUT}/admin-order-deal-1280.png`, fullPage: true });
  });
});

/**
 * Giro garanzia — the mobile order bar declaring the saving (mockup variant A).
 *
 * Four shots, and the point of them is the NARROW case: at 360 the bar already
 * balances a non-shrinking piece count against a truncating title, and the
 * free-shipping suffix («+ frakt» / «+ shipping») shares the total's line. The
 * saving row is what was added between those two, so 360 in ENGLISH with a
 * discount AND the suffix on screen is the shot that proves it fits — English
 * is the worst case, its words are longer.
 *
 * The pair without a discount is not decoration: the requirement is that the
 * bar keeps EXACTLY the height it has today when there is nothing to declare,
 * and two shots side by side are how a human checks that in a second.
 */
test.describe("R4-SCONTI evidence — the sticky bar declares the saving", () => {
  test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: semina una scala sconti");
  test.describe.configure({ timeout: 90_000 });

  const NARROW = { width: 360, height: 780 };
  const PHONE360 = { width: 390, height: 844 };

  for (const locale of ["no", "en"] as const) {
    test(`sticky bar @360 + @390, ${locale.toUpperCase()}, with and without a discount`, async ({
      page,
    }) => {
      const design = await firstActiveDesign();
      const step3 = `/${locale}/configurator?design=${design.slug}&step=3`;

      // (a) NO discount first: the bar as it ships today, the height baseline.
      const off = await seedDiscountTiers([]);
      try {
        await page.setViewportSize(NARROW);
        await page.goto(step3);
        await addFirstCeramic(page);
        await expect(page.getByTestId("step3-sticky-bar")).toBeVisible();
        await expect(page.getByTestId("sticky-bar-saved")).toHaveCount(0);
        await page.screenshot({ path: `${OUT}/sticky-bar-plain-360-${locale}.png` });
      } finally {
        await off.restore();
      }

      // (b) WITH a discount. A 2-piece step keeps the basket under the
      // free-shipping threshold, so the suffix and the saving are on screen
      // together — which is the collision the row was placed to avoid.
      const seeded = await seedDiscountTiers([{ min_qty: 2, pct: 12 }]);
      try {
        await page.goto(step3);
        // The basket is deliberately NOT reset between (a) and (b): the cart
        // persists in localStorage, so the piece added above plus this one make
        // TWO — the tier's threshold — while the net total stays under the
        // 1 000 kr free-shipping mark. That is the only combination that puts
        // the suffix and the saving on screen together, which is the whole
        // point of this shot. A third piece would clear the threshold, the
        // suffix would vanish, and the evidence would stop proving anything.
        await addFirstCeramic(page);
        await expect(async () => {
          await page.reload();
          await expect(page.getByTestId("sticky-bar-saved")).toBeVisible();
        }).toPass({ timeout: 20_000 });
        // both messages on screen together — the collision case
        await expect(page.getByTestId("sticky-bar-total")).toContainText(/frakt|shipping/);
        await page.screenshot({ path: `${OUT}/sticky-bar-saved-360-${locale}.png` });

        await page.setViewportSize(PHONE360);
        await expect(page.getByTestId("sticky-bar-saved")).toBeVisible();
        await page.screenshot({ path: `${OUT}/sticky-bar-saved-390-${locale}.png` });
      } finally {
        await seeded.restore();
      }
    });
  }
});

/**
 * Giro garanzia — the offer's FLOOR, before and after.
 *
 * An offer of N pieces is not owed below N. The two shots are the same line on
 * either side of that edge: the deal active at the offer's own size, then the
 * same line one piece short, where the discount is correctly gone and the nudge
 * says why in the rule's own numbers. Without the second shot the price simply
 * changes while the customer presses «−», which reads as broken.
 *
 * Nothing here is hardcoded to a particular offer: the rule is seeded with the
 * values below and the assertions read them back, so changing them changes the
 * shot, not the test.
 */
test.describe("R4-SCONTI evidence — an offer is not owed below its own size", () => {
  test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: semina una regola upsell");
  test.describe.configure({ timeout: 90_000 });

  const OFFER_QTY = 2;
  const OFFER_PCT = 15;

  for (const locale of ["no", "en"] as const) {
    test(`deal at the offer, then one piece short (${locale.toUpperCase()}) @390`, async ({
      page,
    }) => {
      // Same design-anchored pair discovery discounts.spec.ts uses (D2: a rule
      // cannot cross suppliers), so the trigger product is the one step 3
      // actually renders first.
      const db = adminClient();
      const { data: designs } = await db
        .from("designs")
        .select("id, slug, supplier_id")
        .eq("active", true)
        .order("sort_order");
      let slug = "";
      let triggerId = "";
      let suggestedId = "";
      for (const d of designs ?? []) {
        const trigger = await firstProductOfDesignSupplier(d.id, d.supplier_id);
        if (!trigger) continue;
        const { data: others } = await db
          .from("products")
          .select("id")
          .eq("supplier_id", d.supplier_id)
          .eq("visible", true)
          .neq("id", trigger.id)
          .order("sort_order")
          .limit(1);
        if (others && others.length > 0) {
          slug = d.slug;
          triggerId = trigger.id;
          suggestedId = others[0].id;
          break;
        }
      }
      test.skip(!slug, "needs two visible products of one supplier");
      const seeded = await seedDiscountRule({
        triggerProductId: triggerId,
        suggestedProductId: suggestedId,
        minQty: 2,
        pct: OFFER_PCT,
        suggestedQty: OFFER_QTY,
      });
      try {
        await page.setViewportSize(PHONE);
        await page.goto(`/${locale}/configurator?design=${slug}&step=3`);
        await addFirstCeramic(page);
        await page.getByTestId("docked-qty-inc").first().click(); // reach the trigger
        // The step-3 docked panel is mounted TWICE (desktop column + mobile
        // section) and both carry the same testids, so every query here is
        // scoped to the VISIBLE one — an unscoped getByTestId trips Playwright's
        // strict mode. (Deferred minor D4 of the final review, met in the wild.)
        const vis = (id: string) => page.locator(`[data-testid="${id}"]:visible`);
        const card = vis("cart-suggestion");
        await expect(async () => {
          await page.reload();
          await expect(card).toBeVisible();
        }).toPass({ timeout: 20_000 });
        await card.getByTestId("cart-suggestion-add").click();

        // (a) the deal ON, at exactly the offer's size
        const dealLine = vis("cart-line").last();
        await expect(dealLine.locator('[data-testid="cart-discount-badge"]')).toBeVisible();
        await page.screenshot({ path: `${OUT}/deal-at-offer-390-${locale}.png` });

        // (b) one piece short: the discount is gone and the nudge explains it
        await dealLine.locator('[data-testid="docked-qty-dec"]').click();
        await expect(dealLine.locator('[data-testid="cart-discount-badge"]')).toHaveCount(0);
        const nudge = dealLine.locator('[data-testid="cart-deal-nudge"]');
        await expect(nudge).toBeVisible();
        await expect(nudge).toContainText(String(OFFER_PCT));
        await page.screenshot({ path: `${OUT}/deal-below-offer-390-${locale}.png` });
      } finally {
        await seeded.restore();
      }
    });
  }
});


/**
 * ADR 0024 — the offers block as a LIST.
 *
 * Three shots per locale, and the middle one is the point: with several offers
 * on screen you can see at a glance whether this reads as a list or as a
 * flyer. The third proves the block SHORTENS when one is taken rather than
 * emptying or reshuffling — D1 removes the accepted offer and leaves the rest.
 */
test.describe("R4-SCONTI evidence — offers are a list", () => {
  test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: semina regole upsell");
  test.describe.configure({ timeout: 120_000 });

  for (const locale of ["no", "en"] as const) {
    test(`one offer, then several, then one taken (${locale.toUpperCase()}) @390`, async ({
      page,
    }) => {
      const db = adminClient();
      const { data: designs } = await db
        .from("designs")
        .select("id, slug, supplier_id")
        .eq("active", true)
        .order("sort_order");
      let slug = "";
      let triggerId = "";
      let suggestedId = "";
      for (const d of designs ?? []) {
        const trigger = await firstProductOfDesignSupplier(d.id, d.supplier_id);
        if (!trigger) continue;
        const { data: others } = await db
          .from("products")
          .select("id")
          .eq("supplier_id", d.supplier_id)
          .eq("visible", true)
          .neq("id", trigger.id)
          .order("sort_order")
          .limit(1);
        if (others && others.length > 0) {
          slug = d.slug;
          triggerId = trigger.id;
          suggestedId = others[0].id;
          break;
        }
      }
      test.skip(!slug, "needs two visible products of one supplier");

      const vis = (id: string) => page.locator(`[data-testid="${id}"]:visible`);
      const a = await seedDiscountRule({
        triggerProductId: triggerId,
        suggestedProductId: suggestedId,
        minQty: 1,
        pct: 10,
      });
      try {
        await page.setViewportSize(PHONE);
        await page.goto(`/${locale}/configurator?design=${slug}&step=3`);
        await addFirstCeramic(page);
        // The row COUNT goes inside the poll, not after it: the config is
        // cached for `revalidate: 10`, so a run started seconds after another
        // one's restore can still be served the previous test's rules.
        await expect(async () => {
          await page.reload();
          await expect(vis("cart-suggestion-row")).toHaveCount(1);
        }).toPass({ timeout: 20_000 });
        await vis("cart-suggestion").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${OUT}/offers-one-390-${locale}.png` });

        // a second and a third rule on the same trigger: the block grows
        const b = await seedDiscountRule({
          triggerProductId: triggerId,
          suggestedProductId: suggestedId,
          minQty: 1,
          pct: 20,
          suggestedQty: 2,
        });
        const c = await seedDiscountRule({
          triggerProductId: triggerId,
          suggestedProductId: suggestedId,
          minQty: 1,
          pct: 30,
          suggestedQty: 4,
        });
        try {
          await expect(async () => {
            await page.reload();
            await expect(vis("cart-suggestion-row")).toHaveCount(3);
          }).toPass({ timeout: 20_000 });
          await expect(vis("cart-suggestion")).toHaveCount(1); // ONE block
          // fullPage for this one: three rows do not fit a 390×844 viewport,
          // and half a list cannot answer "list or flyer?", which is the whole
          // question this shot exists to settle.
          await page.screenshot({
            path: `${OUT}/offers-three-390-${locale}.png`,
            fullPage: true,
          });

          // take one: it leaves the list, the others stay
          await vis("cart-suggestion-add").first().click();
          await expect(vis("cart-suggestion")).toHaveCount(0);
          // the block is gone; frame the basket where it used to be
          await vis("cart-list").scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${OUT}/offers-after-add-390-${locale}.png` });
        } finally {
          await c.restore();
          await b.restore();
        }
      } finally {
        await a.restore();
      }
    });
  }
});

/**
 * R4-UPSELL-MODALE — the offer block INSIDE the product sheet (§3.24), not
 * the cart's own suggestion card the blocks above already cover: dimmed and
 * locked below the rule's own threshold, both bundle rows plus «Add both»
 * once unlocked, and the cart after that one gesture — the actual proof of
 * AC3 (the base ceramic AND the discounted suggestion land in one add, never
 * screenshotted before this task).
 *
 * Reuses `discoverTriggerAndSuggested()` (①/② discovery above, D2: rule and
 * candidate must share a supplier) instead of a third copy of that lookup —
 * only the locale in its `step3` URL is swapped per iteration.
 *
 * One seed per locale, both breakpoints inside the SAME seed/restore (same
 * shape as "customer cart: tiers" above): cheaper than seeding twice, and the
 * `localStorage.clear()` between the two passes keeps the SECOND pass's
 * locked shot honest — a bundle already added at 390 would satisfy the
 * trigger before the 1280 pass ever opens the sheet.
 *
 * Every lookup is scoped `[data-testid="…"]:visible`: `sheet-offer-*` live
 * inside the ONE Radix-portalled `ProductSheet` (never duplicated — see the
 * "ONE Radix Dialog" note in product-sheet.tsx), but `cart-line` / `cart-list`
 * are not — the step-3 docked panel is mounted twice (desktop rail + mobile
 * section, same testids), so an unscoped query trips Playwright's strict
 * mode the moment both are in the DOM together (met in the wild on this
 * branch already, see the "offer is not owed below its own size" block).
 */
test.describe("R4-UPSELL-MODALE evidence — the sheet offer block", () => {
  test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: semina una regola upsell nel catalogo reale");
  test.describe.configure({ timeout: 120_000 });

  for (const locale of ["no", "en"] as const) {
    test(`sheet offer locked, unlocked, add both (${locale.toUpperCase()}) @390 + @1280`, async ({
      page,
    }) => {
      const found = await discoverTriggerAndSuggested();
      test.skip(!found, "needs two visible products of one supplier");
      if (!found) return;
      const step3 = found.step3.replace("/no/configurator", `/${locale}/configurator`);

      const seeded = await seedDiscountRule({
        triggerProductId: found.triggerProductId,
        suggestedProductId: found.suggestedProductId,
        minQty: 2,
        pct: 15,
      });
      try {
        const vis = (id: string) => page.locator(`[data-testid="${id}"]:visible`);

        for (const [vp, vpLabel] of [
          [PHONE, "390"],
          [DESKTOP, "1280"],
        ] as const) {
          await page.setViewportSize(vp);
          await page.goto(step3);
          // Fresh basket for this pass: a bundle added in the PREVIOUS
          // breakpoint's "add both" would already satisfy the trigger and
          // the locked state would never appear.
          await page.evaluate(() => localStorage.clear());

          // config.server.ts caches the discount config for up to 10s —
          // reload-and-retry, same idiom as every other seed in this file,
          // so the sheet is never opened against a still-stale read.
          await expect(async () => {
            await page.reload();
            await page.getByTestId("ceramics-step").waitFor();
            await ceramicCards(page).first().click();
            await expect(page.getByTestId("product-sheet")).toBeVisible();
            await expect(vis("sheet-offer-locked")).toBeVisible();
          }).toPass({ timeout: 20_000 });

          // (a) LOCKED — dimmed block, below the rule's own threshold, the
          // unlock CTA in the same frame as the qty stepper it will raise.
          await vis("sheet-offer").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${OUT}/sheet-offer-locked-${vpLabel}-${locale}.png`,
            fullPage: true,
          });

          // (b) UNLOCKED — the unlock button raises the stepper straight to
          // the rule's own quantity (D-Q2: the block's shortcut IS the
          // missing number); both bundle rows plus «Add both» in frame.
          await vis("sheet-offer-unlock").click();
          await expect(vis("sheet-offer-base")).toBeVisible();
          await expect(vis("sheet-offer-extra")).toBeVisible();
          await expect(vis("sheet-offer-add-both")).toBeVisible();
          await vis("sheet-offer").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${OUT}/sheet-offer-unlocked-${vpLabel}-${locale}.png`,
            fullPage: true,
          });

          // (c) ADD BOTH — one gesture, two lines: the configured ceramic
          // AND the discounted suggestion (AC3). «Add both» closes the sheet
          // itself (showAddedToast → setSheet(false)); the cart panel is
          // what proves the second line actually landed.
          await vis("sheet-offer-add-both").click();
          await expect(page.getByTestId("product-sheet")).toBeHidden();
          await expect(vis("cart-line")).toHaveCount(2);
          await vis("cart-list").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${OUT}/sheet-offer-cart-after-add-both-${vpLabel}-${locale}.png`,
            fullPage: true,
          });
        }
      } finally {
        await seeded.restore();
      }
    });
  }
});

/**
 * R4-SCONTI-2 — the product sheet: the ladder and the offer list.
 *
 * READ-ONLY: it seeds nothing and restores nothing, because it does not have
 * to — it runs against the LIVE discount config, which is the whole point of
 * this evidence (the shots must show what the shop actually publishes, tiers
 * and rules included). The only writes in this file stay in the blocks above.
 *
 * The states that need a scale the shop does not currently have (a product
 * excluded from the discounts, a seven-step scale, a same-product offer) cannot
 * be produced without writing to the live catalogue: they are covered by the
 * unit tests (ladder.test.ts, sheet-offer.test.ts) and by the seeded e2e in
 * cart.spec.ts / discounts.spec.ts, which run with MK_E2E_SEED=1.
 */
test.describe("product sheet: the ladder and the offer list (R4-SCONTI-2)", () => {
  const SIZES = [
    { label: "390", size: PHONE },
    { label: "768", size: { width: 768, height: 1000 } },
    { label: "1280", size: DESKTOP },
  ];

  for (const lang of ["no", "en"] as const) {
    for (const { label, size } of SIZES) {
      test(`sheet-ladder ${label} ${lang}`, async ({ page }) => {
        const found = await discoverTriggerAndSuggested();
        test.skip(!found, "no active design whose supplier has two visible products");
        await page.setViewportSize(size);
        await page.goto(found!.step3.replace("/no/", `/${lang}/`));
        await ceramicCards(page).first().click();
        const sheet = page.getByTestId("product-sheet");
        await expect(sheet).toBeVisible();

        // ① below the first step — the scale is a price list before it is a discount
        await sheet.screenshot({ path: `${OUT}/sheet-below-${label}-${lang}.png` });

        const steps = sheet.getByTestId("ladder-step");
        const count = await steps.count();
        test.skip(count === 0, "the live shop has no quantity scale switched on");

        // ② applied — the unit price is rewritten, the full one struck through
        await steps.first().click();
        await expect(sheet.getByTestId("sheet-unit-full")).toBeVisible();
        await sheet.screenshot({ path: `${OUT}/sheet-applied-${label}-${lang}.png` });

        // ③ past the last step — "best discount reached", nothing further promised
        await steps.nth(count - 1).click();
        for (let i = 0; i < 2; i++) await sheet.getByTestId("qty-inc").click();
        await sheet.screenshot({ path: `${OUT}/sheet-best-${label}-${lang}.png` });

        // ④ §D.2, after taking an offer: the sheet STAYS open, the row is marked
        // «added», the stepper is back to 1 and the ladder now counts what the
        // basket holds. Writes nothing but the browser's own cart.
        const add = sheet.getByTestId("sheet-offer-add").first();
        if ((await add.count()) > 0) {
          await add.click();
          await expect(sheet).toBeVisible();
          await expect(sheet.getByTestId("sheet-offer-taken").first()).toBeVisible();
          await expect(sheet.getByTestId("qty-value")).toHaveText("1");
          await sheet.screenshot({ path: `${OUT}/sheet-offer-taken-${label}-${lang}.png` });
        }
      });
    }
  }
});
