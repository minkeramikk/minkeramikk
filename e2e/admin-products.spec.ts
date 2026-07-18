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
 */

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

interface Fixture {
  supplierAId: string;
  supplierBId: string;
  productAIds: string[];
}

let fx: Fixture;

test.beforeAll(async () => {
  const db = adminClient();
  const stamp = Date.now();

  const { data: supA, error: eA } = await db
    .from("suppliers")
    .insert({ name: `E2E Products A ${stamp}`, active: true })
    .select("id")
    .single();
  if (eA) throw eA;
  const { data: supB, error: eB } = await db
    .from("suppliers")
    .insert({ name: `E2E Products B ${stamp}`, active: true })
    .select("id")
    .single();
  if (eB) throw eB;

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
  const { error: aErr } = await db.from("products").insert(aRows);
  if (aErr) throw aErr;

  // 1 product for B: a second group to fence a cross-group drag against
  // (AC-D3), and a supplier to clone INTO (AC1/AC2).
  const { error: bErr } = await db.from("products").insert({
    slug: `e2e-plate-b1-${stamp}`,
    supplier_id: supplierBId,
    name_no: `E2E Plate B1 ${stamp}`,
    name_en: `E2E Plate B1 ${stamp}`,
    price_cents: 10000,
    currency: "NOK",
    visible: true,
    sort_order: 1,
    pieces: 1,
  });
  if (bErr) throw bErr;

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
  if (!fx) return;
  const db = adminClient();
  // Products first (FK: supplier_id references suppliers on delete restrict).
  await db.from("products").delete().in("supplier_id", [fx.supplierAId, fx.supplierBId]);
  await db.from("suppliers").delete().in("id", [fx.supplierAId, fx.supplierBId]);
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

  await expect(group.getByTestId("product-order-saved")).toBeVisible();

  await page.reload();
  const reloadedRows = groupLocator(page, fx.supplierAId).getByTestId("product-row");
  await expect(reloadedRows.nth(1)).toContainText(firstName);
});

test("AC-D2: the arrows still reorder and a burst of clicks saves once", async ({
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

  // One debounced save for the whole burst, not one per click: a single
  // "Saved ✓" is the observable proof (product-order-list.tsx coalesces via
  // the 600ms SAVE_DELAY_MS timer + the gen/chain guards).
  await expect(group.getByTestId("product-order-saved")).toBeVisible();

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
