import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  ADMIN_READY,
  loginAdmin,
  seedOrder,
  deleteOrder,
  adminClient,
  type SeededOrder,
} from "./helpers";

/**
 * Journey 6 — Admin: gestione ordini. ACCEPTANCE.md §6 (storia F07/F07b).
 * Si auto-skippa senza admin creds + service role (per seedare l'ordine).
 */

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

let seeded: SeededOrder;
/** R4-ORDERS-PLUS: `order_events` is migration 0036. 42P01 → the table is not
 *  applied on this DB: a DECLARED skip, never a failure and never a silent one
 *  (lezione F07). Any OTHER error is logged and treated as "ready", so the
 *  suite fails loudly instead of skipping for the wrong reason — same shape as
 *  `probeRulesTable` in discounts.spec.ts. */
let hasOrderEvents = false;
async function probeOrderEvents(): Promise<boolean> {
  const { error } = await adminClient().from("order_events").select("id").limit(1);
  if (error) {
    if (error.code === "42P01") return false;
    console.warn("[e2e admin-orders] unexpected error probing order_events:", error);
    return true;
  }
  return true;
}

test.beforeAll(async () => {
  seeded = await seedOrder("MK-ORD-E2E");
  hasOrderEvents = await probeOrderEvents();
});
test.afterAll(async () => {
  await deleteOrder(seeded?.orderId ?? "");
});

const rowTestId = (t: TestInfo) =>
  t.project.name === "mobile" ? "order-card" : "order-row";
const seededRow = (page: Page, t: TestInfo) =>
  page.locator(`[data-testid="${rowTestId(t)}"][data-code="${seeded.code}"]`);

test("AC1: list shows the seeded order with KPIs", async ({ page }, t) => {
  await loginAdmin(page);
  await expect(page.getByTestId("admin-orders")).toBeVisible();
  await expect(page.getByTestId("kpi-new")).toBeVisible();
  await expect(seededRow(page, t)).toBeVisible();
});

test("AC2: status filter narrows; clearing restores", async ({ page }, t) => {
  await loginAdmin(page);
  await page.getByTestId("filter-status").selectOption("delivered");
  await page.getByTestId("filter-submit").click();
  await expect(seededRow(page, t)).toHaveCount(0);
  await page.getByTestId("filter-clear").click();
  await expect(seededRow(page, t)).toBeVisible();
});

test("AC2: search by order code finds the order", async ({ page }, t) => {
  await loginAdmin(page);
  await page.getByTestId("filter-q").fill(seeded.code);
  await page.getByTestId("filter-submit").click();
  await expect(page.getByTestId(rowTestId(t))).toHaveCount(1);
  await expect(seededRow(page, t)).toBeVisible();
});

test("AC3: status change requires confirmation, persists and re-reads", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await expect(page.getByTestId("order-detail")).toBeVisible();

  await page.getByTestId("status-select").selectOption("confirmed");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm-dialog")).toBeVisible();
  await page.getByTestId("status-confirm").click();

  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "confirmed");
  await page.reload();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "confirmed");
  await expect(page.getByTestId("status-select")).toHaveValue("confirmed");
});

test("AC3: cancelling the confirmation makes no change", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const before = await page.getByTestId("order-detail").getAttribute("data-status");

  await page.getByTestId("status-select").selectOption("cancelled");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm-dialog")).toBeVisible();
  await page.getByTestId("status-cancel").click();

  await expect(page.getByTestId("status-confirm-dialog")).toBeHidden();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", before!);
});

test("AC4: internal notes persist", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const note = `call back ${Date.now()}`;
  await page.getByTestId("notes-input").fill(note);
  await page.getByTestId("notes-save").click();

  const db = adminClient();
  await expect
    .poll(async () =>
      (await db.from("orders").select("internal_notes").eq("id", seeded.orderId).single())
        .data?.internal_notes
    )
    .toBe(note);
  await page.reload();
  await expect(page.getByTestId("notes-input")).toHaveValue(note);
});

test("AC5: config code link opens the configurator on that design", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const link = page.getByTestId("config-code-link").first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/configurator\?design=/);
  if (seeded.designSlug) {
    await expect(page).toHaveURL(new RegExp(`design=${seeded.designSlug}`));
  }
});

test("AC6 (mobile): order card shown, no horizontal overflow", async ({ page }, t) => {
  test.skip(t.project.name !== "mobile", "mobile-only");
  await loginAdmin(page);
  await page.getByTestId("filter-q").fill(seeded.code);
  await page.getByTestId("filter-submit").click();
  await expect(seededRow(page, t)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/* ─────────────── R4-ORDERS · lifecycle v2 (ADR 0021) ───────────────
 * These run AFTER the F07 cases above and walk the seeded order forward
 * (confirmed → shipped). afterAll deletes it, so the end state doesn't matter.
 */

test("AC1: the status select offers shipped and hides contacted", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const options = page.locator('[data-testid="status-select"] option');
  await expect(options.filter({ hasText: "Shipped" })).toHaveCount(1);
  await expect(options.filter({ hasText: "Contacted" })).toHaveCount(0);
});

// R4-MAIL-JOURNEY §D retired the `confirmed` mail (EMAIL_STATUSES is
// ["in_production", "shipped"] now: confirmed and in_production landed on the
// same journey dot, and two mails showing an identical bar are worse than one
// mail fewer). This test still drove `confirmed` and waited for a preview that
// no longer exists. The AC it defends is the opt-OUT checkbox, not that
// particular status, so it moves to a status that still writes to the customer.
test("AC2: unticking the checkbox changes the status and sends nothing", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await page.getByTestId("status-select").selectOption("in_production");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("email-preview")).toBeVisible();
  await expect(page.getByTestId("send-email")).toBeChecked(); // opt-out, not opt-in
  await page.getByTestId("send-email").uncheck();
  await page.getByTestId("status-confirm").click();

  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "in_production");
  await expect(page.getByTestId("status-notice")).not.toContainText("Email sent");
});

test("AC3: shipped without a tracking code needs an explicit acknowledgement", async ({ page }) => {
  await loginAdmin(page);
  await adminClient().from("orders").update({ tracking_code: null }).eq("id", seeded.orderId);
  await page.goto(`/admin/orders/${seeded.orderId}`);

  await page.getByTestId("status-select").selectOption("shipped");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("status-confirm")).toBeDisabled();

  await page.getByTestId("tracking-input-dialog").fill("NO123456789");
  await expect(page.getByTestId("status-confirm")).toBeEnabled();
  await page.getByTestId("status-confirm").click();

  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "shipped");
  await expect
    .poll(async () =>
      (await adminClient().from("orders").select("tracking_code").eq("id", seeded.orderId).single())
        .data?.tracking_code
    )
    .toBe("NO123456789");
});

test("AC4: the payment toggle sets and clears paid_at, and the badge follows", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const badge = page.getByTestId("paid-badge");
  const before = await badge.getAttribute("data-paid");

  await page.getByTestId("paid-toggle").click();
  await expect(badge).not.toHaveAttribute("data-paid", before!);
  await page.getByTestId("paid-toggle").click();
  await expect(badge).toHaveAttribute("data-paid", before!);
});

test("AC5: the detail shows the full customer data", async ({ page }) => {
  await loginAdmin(page);
  await adminClient()
    .from("orders")
    .update({ address: "Storgata 1", zipcode: "0155", country: "Norge" })
    .eq("id", seeded.orderId);
  await page.goto(`/admin/orders/${seeded.orderId}`);

  const addr = page.getByTestId("customer-address");
  await expect(addr).toContainText("Storgata 1");
  await expect(addr).toContainText("0155");
  await expect(addr).toContainText("Norge");
});

test("AC7: a status change with the email ticked writes the event, outcome and all", async ({
  page,
}, t) => {
  t.skip(!hasOrderEvents, "migration 0036 (order_events) non applicata su questo DB");
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);

  // «Order created» is there before a single event is written: it is synthetic,
  // derived from orders.created_at, which is what makes pre-log orders work.
  await expect(page.getByTestId("order-timeline")).toContainText("Order created");

  await page.getByTestId("status-select").selectOption("in_production");
  await page.getByTestId("status-save").click();
  await expect(page.getByTestId("send-email")).toBeChecked(); // opt-out, not opt-in
  await page.getByTestId("status-confirm").click();

  const rows = page.getByTestId("timeline-row");
  await expect(rows.last()).toContainText("In production");
  await expect(rows.last()).toContainText("email sent to");
});

test("AC8: a status that no longer mails says «no email» — that is how the change is seen", async ({
  page,
}, t) => {
  t.skip(!hasOrderEvents, "migration 0036 (order_events) non applicata su questo DB");
  // R4-MAIL-JOURNEY retired the `confirmed` mail (EMAIL_STATUSES). The register
  // is where Alessio sees that, without anyone having to tell him.
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  await page.getByTestId("status-select").selectOption("confirmed");
  await page.getByTestId("status-save").click();
  await page.getByTestId("status-confirm").click();

  await expect(page.getByTestId("timeline-row").last()).toContainText("Confirmed · no email");
});

test("AC9: undoing a payment is logged, and logged as sending nothing", async ({ page }, t) => {
  t.skip(!hasOrderEvents, "migration 0036 (order_events) non applicata su questo DB");
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded.orderId}`);
  const toggle = page.getByTestId("paid-toggle");
  const wasPaid = (await toggle.innerText()).includes("Undo");
  if (!wasPaid) {
    await toggle.click(); // register → mails, and logs the outcome
    await expect(page.getByTestId("timeline-row").last()).toContainText("Payment registered");
  }
  await page.getByTestId("paid-toggle").click(); // undo → mails nothing
  await expect(page.getByTestId("timeline-row").last()).toHaveText(/Payment undone$/);
});
