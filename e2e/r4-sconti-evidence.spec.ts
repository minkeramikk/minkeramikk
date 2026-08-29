import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  ADMIN_READY,
  CAN_SEED,
  adminClient,
  addFirstCeramic,
  deleteOrder,
  firstActiveDesign,
  loadEnvLocal,
  loginAdmin,
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

  test("admin-order-discount + admin-ratify (1280)", async ({ page }) => {
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
  });
});
