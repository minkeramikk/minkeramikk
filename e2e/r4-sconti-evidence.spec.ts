import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  ADMIN_READY,
  CAN_SEED,
  adminClient,
  addFirstCeramic,
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
