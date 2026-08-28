import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  ADMIN_READY,
  adminClient,
  deleteOrder,
  loadEnvLocal,
  loginAdmin,
  seedOrder,
  type SeededOrder,
} from "./helpers";

/**
 * R4-ORDERS evidence (tooling, NOT a gate) — the shots the PR needs: pipeline
 * v2, the three email dialogs with their tick, the shipped-without-tracking
 * guard, the payment toggle, full customer data, list badges, at 1280 and 390.
 *
 * Everything is captured on a SEEDED order and the list is always filtered to
 * its code: no real customer ever appears in a screenshot. The order is deleted
 * at the end.
 *
 * Run: npx playwright test e2e/r4-orders-evidence.spec.ts --project=evidence
 */
loadEnvLocal();
const OUT = "docs/evidence/r4-orders";
mkdirSync(OUT, { recursive: true });

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

let seeded: SeededOrder;
test.beforeAll(async () => {
  seeded = await seedOrder("MK-R4-EV");
  seeded.code = "MK-R4EV";
  // A complete customer: AC5 is exactly "the detail shows all of it".
  await adminClient()
    .from("orders")
    .update({
      // A realistic code: the seeder's timestamped one is far longer than any
      // real MK-XXXX and would dominate the 390 shot.
      code: "MK-R4EV",
      customer_name: "Kari Nordmann",
      email: "kari.nordmann@example.no",
      phone: "+47 400 00 000",
      address: "Storgata 1B",
      zipcode: "0155",
      country: "Norge",
      message: "Kan dere pakke det som gave?",
    })
    .eq("id", seeded.orderId);
});
test.afterAll(async () => {
  await deleteOrder(seeded?.orderId ?? "");
});

/** Open the confirm dialog on a target status, shoot it, and optionally go
 *  through with it — the transition is what puts the [email:noop] line in the
 *  server log, which is the evidence that the mail path fired. */
async function shootDialog(
  page: import("@playwright/test").Page,
  target: string,
  file: string,
  confirm = true
) {
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await page.getByTestId("status-select").selectOption(target);
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm-dialog")).toBeVisible();
  await expect(page.getByTestId("send-email")).toBeChecked();
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  if (confirm) {
    await page.getByTestId("status-confirm").click();
    await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", target);
    await expect(page.getByTestId("status-notice")).toContainText("Email sent");
  }
}

test("orders list: status + payment badges, KPIs (1280 + 390)", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await loginAdmin(page);

  // filtered to the seeded code — no real customer in the frame
  await page.getByTestId("filter-q").fill(seeded.code);
  await page.getByTestId("filter-submit").click();
  await expect(page.getByTestId("paid-badge").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/list-1280.png` });

  // the status filter, rendered open: `size` expands the native select in place,
  // so the shot shows the REAL option list (shipped in, contacted out).
  await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>('[data-testid="filter-status"]');
    if (!sel) return;
    sel.size = sel.options.length; // native expansion, real option list
    sel.style.height = "auto"; // the h-9 utility would clip it
    sel.style.position = "relative";
    sel.style.zIndex = "10";
  });
  await page.screenshot({ path: `${OUT}/filters-1280.png` });

  await page.setViewportSize(PHONE);
  await page.goto(`/admin?q=${encodeURIComponent(seeded.code)}`);
  await expect(page.getByTestId("order-card")).toHaveCount(1);
  await page.screenshot({ path: `${OUT}/list-390.png` });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("detail: pipeline v2, full customer data, payment toggle", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);

  await expect(page.getByTestId("order-detail")).toBeVisible();
  await page.screenshot({ path: `${OUT}/pipeline-1280.png` });
  await page
    .getByTestId("customer-address")
    .locator("xpath=ancestor::section[1]")
    .screenshot({ path: `${OUT}/detail-customer-1280.png` });

  const payment = page.getByTestId("paid-form").locator("xpath=ancestor::section[1]");
  await payment.screenshot({ path: `${OUT}/paid-toggle-before-1280.png` });
  await page.getByTestId("paid-toggle").click();
  await expect(page.getByTestId("paid-badge")).toHaveAttribute("data-paid", "1");
  await payment.screenshot({ path: `${OUT}/paid-toggle-after-1280.png` });
});

test("the three email dialogs + the shipped-without-tracking guard", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await loginAdmin(page);

  await shootDialog(page, "confirmed", "dialog-confirmed-1280.png");
  await shootDialog(page, "in_production", "dialog-production-1280.png");

  // no tracking yet → Confirm is disabled until the admin acknowledges it
  await adminClient().from("orders").update({ tracking_code: null }).eq("id", seeded.orderId);
  await shootDialog(page, "shipped", "dialog-shipped-no-tracking-1280.png", false);
  await expect(page.getByTestId("status-confirm")).toBeDisabled();

  // with the code typed in: preview quotes it, Confirm unlocks
  await page.getByTestId("tracking-input-dialog").fill("NO123456789");
  await expect(page.getByTestId("email-preview")).toContainText("NO123456789");
  await expect(page.getByTestId("status-confirm")).toBeEnabled();
  await page.screenshot({ path: `${OUT}/dialog-shipped-1280.png`, fullPage: true });

  // actually ship it, so the detail shot below shows the end state
  await page.getByTestId("status-confirm").click();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "shipped");
  await page.screenshot({ path: `${OUT}/detail-shipped-tracking-1280.png`, fullPage: true });

  await page.setViewportSize(PHONE);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await expect(page.getByTestId("order-detail")).toBeVisible();
  await page.screenshot({ path: `${OUT}/detail-390.png`, fullPage: true });

  // What this card owns is the new Payment & shipping section: it must not be
  // what pushes the page sideways. The page-level number is recorded as data,
  // NOT asserted: at 390 the detail overflows ~10px because of the AdminShell
  // header row ("Order MK-XXXX" + back-link + logout, no wrap), which is
  // pre-existing and shared by every admin page — measured identical with this
  // section removed from the DOM. Flagged to the TL, not fixed here.
  const m = await page.evaluate(() => {
    const vw = window.innerWidth;
    const sec = document.querySelector('[data-testid="paid-form"]')!.closest("section")!;
    return {
      page: document.documentElement.scrollWidth - vw,
      section: Math.round(sec.getBoundingClientRect().right) - vw,
      viewport: vw,
    };
  });
  expect(m.section).toBeLessThanOrEqual(0);
  writeFileSync(
    `${OUT}/overflow-390.txt`,
    `order detail @${m.viewport}px\n` +
      `  page overflow:                    ${m.page}px  (pre-existing, AdminShell header)\n` +
      `  new payment/shipping section:     ${m.section}px  (must be <= 0)\n`
  );
});
