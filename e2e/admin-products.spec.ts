import { test, expect, type Page } from "@playwright/test";
import { adminClient, loginAdmin, ADMIN_READY } from "./helpers";

/**
 * F39 — grouped-by-supplier product list (drag&drop reorder + arrow fallback)
 * and the "clone ceramics onto another supplier" flow.
 *
 * The reorder/clone ACs need TWO suppliers, one of them with >=3 products, to
 * be meaningful (AC-D2's burst needs a 3rd row; AC-D3/clone need a second
 * group to fence against). The live catalog's supplier/product mix is not
 * guaranteed to offer that shape at any given time (ACCEPTANCE.md: never pin
 * counts from the shared DB), so this file seeds its OWN two throwaway
 * suppliers + products (same pattern as seedOrderWithSupplierEmail in
 * helpers.ts) instead of discovering fixtures and conditionally skipping.
 * That keeps every case here a real assertion, never a skip that would pass
 * silently against a broken app.
 *
 * AC-D4 (a save error rolls the list back) is NOT covered here: forcing the
 * `reorder_products` RPC to fail from Playwright would need request
 * interception on a server action, which this suite has no precedent for
 * (grep confirms: no `page.route`/`page.on("request")` anywhere in e2e/).
 * The rollback path itself (product-order-list.tsx:80-87, restoring
 * `saved.current` on error) is a plain state assignment with no async
 * branching worth a dedicated unit test either — it's exercised by reading,
 * which is the honest thing to say rather than fake an RPC failure here.
 *
 * AC-D2 (arrow-click burst) is similarly limited: this suite cannot assert
 * how many `reorderProducts` requests a burst of clicks produced — that
 * would need the same request interception AC-D4 is missing. The test below
 * verifies what it CAN observe from the DOM (the arrows still reorder
 * through a burst, the final order persists, the UI settles into "Saved ✓"),
 * not that the clicks were coalesced into a single request: an app that
 * dropped the debounce and fired one immediate save per click would reach
 * the same final order and the same terminal "Saved ✓", because the saves
 * are serialised through `chain.current`.
 */

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

interface Fixture {
  supplierAId: string;
  supplierBId: string;
  productAIds: string[];
}

let fx: Fixture;

// Populated as soon as each insert below succeeds, so afterAll can clean up
// whatever actually got created even if a LATER step in beforeAll throws —
// the all-or-nothing `fx` object only exists once every step has succeeded,
// so gating cleanup on it left earlier inserts orphaned in the shared e2e DB
// whenever a later step failed.
const createdSupplierIds: string[] = [];
const createdProductIds: string[] = [];

test.beforeAll(async () => {
  const db = adminClient();
  const stamp = Date.now();

  const { data: supA, error: eA } = await db
    .from("suppliers")
    .insert({ name: `E2E Products A ${stamp}`, active: true })
    .select("id")
    .single();
  if (eA) throw eA;
  createdSupplierIds.push(supA!.id as string);

  const { data: supB, error: eB } = await db
    .from("suppliers")
    .insert({ name: `E2E Products B ${stamp}`, active: true })
    .select("id")
    .single();
  if (eB) throw eB;
  createdSupplierIds.push(supB!.id as string);

  const supplierAId = supA!.id as string;
  const supplierBId = supB!.id as string;

  // 3 products for A: enough rows for a drag (AC-D1) and an arrow burst that
  // needs a 3rd row to move through (AC-D2).
  const aRows = [1, 2, 3].map((n) => ({
    slug: `e2e-plate-a${n}-${stamp}`,
    supplier_id: supplierAId,
    name_no: `E2E Plate A${n} ${stamp}`,
    name_en: `E2E Plate A${n} ${stamp}`,
    price_cents: 10000 * n,
    currency: "NOK",
    visible: true,
    sort_order: n,
    pieces: 1,
  }));
  const { data: aInserted, error: aErr } = await db.from("products").insert(aRows).select("id");
  if (aErr) throw aErr;
  createdProductIds.push(...(aInserted ?? []).map((r) => r.id as string));

  // 1 product for B: a second group to fence a cross-group drag against
  // (AC-D3), and a supplier to clone INTO (AC1/AC2).
  const { data: bInserted, error: bErr } = await db
    .from("products")
    .insert({
      slug: `e2e-plate-b1-${stamp}`,
      supplier_id: supplierBId,
      name_no: `E2E Plate B1 ${stamp}`,
      name_en: `E2E Plate B1 ${stamp}`,
      price_cents: 10000,
      currency: "NOK",
      visible: true,
      sort_order: 1,
      pieces: 1,
    })
    .select("id");
  if (bErr) throw bErr;
  createdProductIds.push(...(bInserted ?? []).map((r) => r.id as string));

  const { data: aFetched, error: aFetchErr } = await db
    .from("products")
    .select("id")
    .eq("supplier_id", supplierAId)
    .order("sort_order", { ascending: true });
  if (aFetchErr) throw aFetchErr;

  fx = {
    supplierAId,
    supplierBId,
    productAIds: (aFetched ?? []).map((r) => r.id as string),
  };
});

test.afterAll(async () => {
  const db = adminClient();
  // Products first (FK: supplier_id references suppliers on delete restrict).
  // Delete by tracked id, not by the all-or-nothing `fx` — this runs cleanup
  // even when beforeAll threw partway through.
  if (createdProductIds.length) {
    await db.from("products").delete().in("id", createdProductIds);
  }
  // Keep the sweep-by-supplier too: it also removes clone-created rows
  // (AC1/AC2 clones products into supplier B's group, which never went
  // through createdProductIds).
  if (createdSupplierIds.length) {
    await db.from("products").delete().in("supplier_id", createdSupplierIds);
    await db.from("suppliers").delete().in("id", createdSupplierIds);
  }
});

const groupLocator = (page: Page, supplierId: string) =>
  page.locator(`[data-testid="product-group"][data-supplier="${supplierId}"]`);

test("AC-D1: dragging a product changes the order and it survives a reload", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/products");

  const group = groupLocator(page, fx.supplierAId);
  const rows = group.getByTestId("product-row");
  await expect(rows).toHaveCount(3);

  const firstName = (await rows.nth(0).innerText()).split("\n")[0];
  await rows.nth(0).dragTo(rows.nth(1));

  // Page-scoped on purpose: "product-order-saved" lives in the group's
  // header <div>, a SIBLING of the <ul data-testid="product-group"> that
  // `group` points at — a group-scoped getByTestId would search only the
  // <ul>'s subtree and never find it. Only one group is mid-save here, so
  // page-scoping is unambiguous. Do not "fix" this back to `group`.
  await expect(page.getByTestId("product-order-saved")).toBeVisible();

  await page.reload();
  const reloadedRows = groupLocator(page, fx.supplierAId).getByTestId("product-row");
  await expect(reloadedRows.nth(1)).toContainText(firstName);
});

test("AC-D2: the arrows still reorder through a fast burst and the order persists", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/products");

  const group = groupLocator(page, fx.supplierAId);
  const rows = group.getByTestId("product-row");
  await expect(rows).toHaveCount(3);

  // Whatever sits at index 2 right now — move it up twice in a fast burst.
  const name = (await rows.nth(2).innerText()).split("\n")[0];
  await rows.nth(2).getByTestId("product-move-up").click();
  await rows.nth(1).getByTestId("product-move-up").click();

  // This proves the burst reorders correctly and the UI settles into
  // "Saved ✓" — it does NOT prove the burst was coalesced into a single
  // request (see the file-level comment above: that would need request
  // interception this suite doesn't have).
  // Page-scoped on purpose, same reason as AC-D1 above: "product-order-saved"
  // is a sibling of the <ul> `group` points at, not a descendant.
  await expect(page.getByTestId("product-order-saved")).toBeVisible();

  await page.reload();
  const reloadedRows = groupLocator(page, fx.supplierAId).getByTestId("product-row");
  await expect(reloadedRows.nth(0)).toContainText(name);
});

test("AC-D3: a product cannot be dragged into another supplier's group", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/products");

  const groupA = groupLocator(page, fx.supplierAId);
  const groupB = groupLocator(page, fx.supplierBId);
  await expect(groupA.getByTestId("product-row")).toHaveCount(3);
  await expect(groupB.getByTestId("product-row")).toHaveCount(1);

  const aFirstName = (await groupA.getByTestId("product-row").first().innerText()).split(
    "\n"
  )[0];

  await groupA
    .getByTestId("product-row")
    .first()
    .dragTo(groupB.getByTestId("product-row").first());

  // Confined to the group: no row crossed over, A's lead item is unmoved.
  await expect(groupA.getByTestId("product-row")).toHaveCount(3);
  await expect(groupB.getByTestId("product-row")).toHaveCount(1);
  await expect(groupA.getByTestId("product-row").first()).toContainText(aFirstName);
});

test("AC1/AC2: cloning ceramics onto another supplier creates hidden copies in the target group", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/products");
  await page.getByTestId("clone-ceramics-link").click();
  await expect(page.getByTestId("clone-ceramics")).toBeVisible();

  await page.getByTestId("clone-from").selectOption(fx.supplierAId);
  await page.getByTestId("clone-to").selectOption(fx.supplierBId);
  await expect(page.getByTestId("clone-picker")).toBeVisible();

  await page.getByTestId("clone-select-all").click();
  await expect(page.getByTestId("clone-counter")).toContainText(
    `${fx.productAIds.length} of ${fx.productAIds.length}`
  );

  await page.getByTestId("clone-run").click();
  await expect(page.getByTestId("clone-report")).toBeVisible();
  await expect(page.getByTestId("clone-report-ok")).toHaveCount(fx.productAIds.length);
  await expect(page.getByTestId("clone-report-fail")).toHaveCount(0);

  await page.goto("/admin/products");
  const groupB = groupLocator(page, fx.supplierBId);
  // The original visible product + the fresh (hidden) clones.
  await expect(groupB.getByTestId("product-row")).toHaveCount(1 + fx.productAIds.length);
  await expect(
    groupB.getByTestId("product-toggle-visible").filter({ hasText: "No" })
  ).toHaveCount(fx.productAIds.length);
});
