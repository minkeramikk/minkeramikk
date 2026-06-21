import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  firstActiveDesign,
  firstActiveDesignWithId,
  secondActiveDesignWithId,
  firstProductOfDesignSupplier,
  firstSupplier,
  ceramicRadios,
  horizontalOverflow,
  loginAdmin,
  ADMIN_READY,
} from "./helpers";

/**
 * Journey 1 — Configuratore pubblico (design → opzioni → ceramica).
 * ACCEPTANCE.md §1. Resilient: scopre design/prodotti dal catalogo vivo,
 * niente slug né conteggi hardcoded.
 */

const designCards = (page: Page) =>
  page.getByTestId("design-step").locator("button[aria-pressed]");

async function activeDesignNames(): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("designs")
    .select("name")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((d) => d.name as string);
}

test("AC1: every active design renders, in sort_order, with a supplier badge", async ({
  page,
}) => {
  const names = await activeDesignNames();
  expect(names.length).toBeGreaterThan(0);

  await page.goto("/no/configurator");
  const cards = designCards(page);
  await expect(cards).toHaveCount(names.length);

  const labels = await cards.allInnerTexts();
  expect(labels.map((l) => l.split("\n")[0])).toEqual(names);
  // public supplier name on every card (ADR 0009); badge CSS uppercases it
  for (const label of labels) expect(label.toLowerCase()).toMatch(/[a-z]/);
});

test("AC1: a design flipped to active=false does not render", async ({ page }) => {
  const admin = adminClient();
  const supplier = await firstSupplier();
  const slug = `e2e-inactive-${Date.now()}`;
  const { data: created, error } = await admin
    .from("designs")
    .insert({
      slug,
      name: "E2E Inactive Design",
      supplier_id: supplier.id,
      active: false,
      sort_order: 999,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  try {
    const names = await activeDesignNames();
    await page.goto("/no/configurator");
    await expect(designCards(page)).toHaveCount(names.length);
    await expect(page.getByText("E2E Inactive Design")).toHaveCount(0);
  } finally {
    await admin.from("designs").delete().eq("id", created!.id);
  }
});

test("AC2: step 2 shows the design's option categories; a choice updates the preview + URL and survives reload", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);

  const step = page.getByTestId("details-step");
  await expect(step).toBeVisible();
  // at least one option category with a radiogroup
  const firstGroup = step.getByRole("radiogroup").first();
  await expect(firstGroup).toBeVisible();

  // choose the first option → preview composes a multiply layer, no reload
  await firstGroup.getByRole("radio").first().click();
  await expect(page).toHaveURL(/opt_/);
  await expect(
    page.locator('[data-testid="preview-canvas"] img[style*="multiply"]').first()
  ).toBeVisible();

  // selection reconstructs after reload
  await page.reload();
  await expect(
    step.getByRole("radio", { checked: true }).first()
  ).toBeVisible();
});

// NB: il toggle "Lås farger" (sync hex tra categorie con lo stesso sync_group)
// è coperto dagli UNIT test (config-code/reducer). Niente e2e dedicato: dipendeva
// da un design specifico + pagina di preview pesante → fragile (timeout di load),
// senza valore aggiunto rispetto agli unit. Vedi docs/release/ACCEPTANCE.md.

test("AC3: step 3 shows the supplier's ceramics with NOK-formatted prices", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=3`);
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  await expect(ceramicRadios(page).first()).toBeVisible();
  // at least one price in Norwegian style ("… kr", grouped thousands, no decimals)
  await expect(
    page.getByTestId("ceramics-step").getByText(/\d[\d\s]*\s*kr/).first()
  ).toBeVisible();
});

test("AC4: english locale renders english labels", async ({ page }) => {
  await page.goto("/en/configurator");
  await expect(
    page.getByRole("heading", { name: "Choose design" })
  ).toBeVisible();
  await expect(page.getByTestId("next-step")).toContainText("Next step");
});

test("AC5 (mobile): no horizontal overflow, touch targets ≥44px", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only");
  await page.goto("/no/configurator");
  const card = designCards(page).first();
  const box = await card.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("R2-1a: changing the cover default in F10 changes the step-1 cover", async ({
  page,
}) => {
  const db = adminClient();

  interface OptRow {
    id: string;
    is_default: boolean;
    layer_image: string | null;
    active: boolean;
    sort_order: number;
  }
  interface CatRow {
    id: string;
    design_id: string;
    designs: { slug: string; name: string; active: boolean } | null;
    options: OptRow[] | null;
  }

  // Find a category on an ACTIVE design with >=2 active options that have a
  // compositing layer, so the cover visibly differs when the default switches.
  const { data: cats, error } = await db
    .from("option_categories")
    .select(
      "id, design_id, designs(slug, name, active), options(id, is_default, layer_image, active, sort_order)"
    );
  if (error) throw error;

  const rows = (cats ?? []) as unknown as CatRow[];

  const target = rows
    .filter((c: CatRow) => c.designs?.active)
    .map((c: CatRow) => ({
      cat: c,
      usable: (c.options ?? [])
        .filter((o: OptRow) => o.active && o.layer_image)
        .sort((a: OptRow, b: OptRow) => a.sort_order - b.sort_order),
    }))
    .find((c) => c.usable.length >= 2);

  test.skip(
    !target,
    "no category with >=2 layered active options to switch between"
  );

  const designName = target!.cat.designs!.name;
  const current: OptRow =
    target!.usable.find((o: OptRow) => o.is_default) ?? target!.usable[0];
  const next = target!.usable.find((o: OptRow) => o.id !== current.id)!;

  const coverSrcs = async (): Promise<(string | null)[]> => {
    await page.goto("/no/configurator");
    const card = page
      .getByTestId("design-step")
      .locator("button[aria-pressed]")
      .filter({ hasText: designName });
    await expect(card.first()).toBeVisible();
    return card
      .first()
      .locator("img")
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLImageElement).getAttribute("src"))
      );
  };

  const before = await coverSrcs();

  // Switch the default via the admin UI (F10 design tree).
  await loginAdmin(page);
  await page.goto(`/admin/designs/${target!.cat.design_id}`);

  const details = page.locator(
    `details:has(input[name="optionId"][value="${next.id}"])`
  );
  // Open the accordion if collapsed.
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) {
    await details.locator('summary[data-testid="category-summary"]').first().click();
  }
  const defaultBtn = details
    .locator(
      `form:has(input[name="optionId"][value="${next.id}"]) [data-testid="tree-option-default"]`
    )
    .first();
  await defaultBtn.click();
  await expect(defaultBtn).toHaveAttribute("data-default", "1");

  const after = await coverSrcs();
  expect(after).not.toEqual(before);

  // Restore the original default so the suite stays order-independent.
  await db
    .from("options")
    .update({ is_default: false })
    .eq("category_id", target!.cat.id)
    .neq("id", current.id);
  await db.from("options").update({ is_default: true }).eq("id", current.id);
});

test("R2-1b: mobile @390 — Next-step CTA is reachable without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "mobile-only CTA (sticky bar is md:hidden)"
  );

  await page.goto("/no/configurator");

  // Choose the first design (AC6 frames the CTA as "after choosing a design").
  await designCards(page).first().click();

  const cta = page.getByTestId("next-step-mobile");
  await expect(cta).toBeVisible();

  // Reachable WITHOUT scrolling: inside the viewport at the initial scroll
  // position (scrollY === 0) and tall enough to tap (≥44px).
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);

  // Navigates to step 2 keeping the config in the URL.
  await cta.click();
  await expect(page).toHaveURL(/[?&]step=2/);
  await expect(page).toHaveURL(/[?&]design=/);
});

/**
 * R2-4b: product info — "i" icon + popover at step 3.
 *
 * Strategy mirrors R2-2b: drive the admin UI (not a raw DB write) so the
 * `catalog`-tagged cache is revalidated by `saveProduct`. Add 2 attributes to
 * a real product, then assert the public step-3 tile shows the "i", the click
 * opens the popover with the attributes, and the gesture does NOT select the
 * radio. Always restores (removes the attributes) in `finally`.
 *
 * Gate: ADMIN_READY (admin creds + service role).
 *
 * Locale note: on `/no` the popover renders Norwegian labels (`Vekt`,
 * `Materiale`) — NOT the English ones (`Weight`, `Material`). We assert only
 * the Norwegian labels and locale-independent values (`1,2 kg`, `Stoneware`).
 */
test.describe("R2-4b product info", () => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL + ADMIN_PASSWORD + service role");

  test("step-3 'i' opens a popover with the product attributes, separate from add-to-cart", async ({
    page,
  }) => {
    const design = await firstActiveDesignWithId();
    const { data: d, error: dErr } = await adminClient()
      .from("designs")
      .select("supplier_id")
      .eq("id", design.id)
      .single();
    if (dErr) throw dErr;
    const product = await firstProductOfDesignSupplier(d!.supplier_id);
    test.skip(!product, "design's supplier has no visible product to annotate");

    try {
      // (a) Admin UI: add 2 attributes to the product, save (revalidates catalog).
      await loginAdmin(page);
      await page.goto(`/admin/products/${product!.id}`);
      await page.getByTestId("product-form").waitFor();

      await page.getByTestId("attribute-add").click();
      let rows = page.getByTestId("attribute-row");
      await rows.nth(0).getByTestId("attribute-label-no").fill("Vekt");
      await rows.nth(0).getByTestId("attribute-label-en").fill("Weight");
      await rows.nth(0).getByTestId("attribute-value").fill("1,2 kg");

      await page.getByTestId("attribute-add").click();
      rows = page.getByTestId("attribute-row");
      await rows.nth(1).getByTestId("attribute-label-no").fill("Materiale");
      await rows.nth(1).getByTestId("attribute-label-en").fill("Material");
      await rows.nth(1).getByTestId("attribute-value").fill("Stoneware");

      await page.getByTestId("product-save").click();
      await expect(page).toHaveURL(/\/admin\/products$/);

      // (b) Public step 3 for that design.
      await page.goto(`/no/configurator?design=${design.slug}&step=3`);
      await page.getByTestId("ceramics-step").waitFor();

      const tile = page.getByTestId(`product-${product!.slug}`);
      await expect(tile).toBeVisible();
      const wasSelected = await tile.getAttribute("aria-checked");

      // AC4: the "i" exists and opens the popover with the attributes.
      // On /no the popover shows Norwegian labels (Vekt, Materiale), not English.
      const info = page.getByTestId(`product-info-${product!.slug}`);
      await expect(info).toBeVisible();
      await info.click();
      const popover = page.getByTestId("product-info-popover");
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Vekt");
      await expect(popover).toContainText("Materiale");
      await expect(popover).toContainText("1,2 kg");
      await expect(popover).toContainText("Stoneware");

      // AC5: clicking the "i" did NOT toggle the radio selection.
      expect(await tile.getAttribute("aria-checked")).toBe(wasSelected);

      // AC5: Esc closes.
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
    } finally {
      // Restore: remove the attributes via the admin UI (revalidates catalog).
      await page.goto(`/admin/products/${product!.id}`);
      await page.getByTestId("product-form").waitFor();
      const removeButtons = page.getByTestId("attribute-remove");
      for (let n = await removeButtons.count(); n > 0; n--) {
        await page.getByTestId("attribute-remove").first().click();
      }
      await page.getByTestId("product-save").click();
      await expect(page).toHaveURL(/\/admin\/products$/);
    }
  });
});

/**
 * R2-2b: Custom colour notes — e2e journey.
 *
 * Strategy: toggle the flag via the admin UI (not a direct DB write) so that
 * the Next.js `unstable_cache` tagged "catalog" is revalidated via the server
 * action `saveDesign` → `revalidateTag("catalog")`. A direct DB write would
 * leave a stale cache entry and cause the block to not appear on the
 * production build server → false-fail.
 *
 * Gate: ADMIN_READY (admin creds + service role both present), because:
 *   - we drive the admin UI to set the flag and revalidate cache
 *   - we use the service role to discover the design id at runtime
 */
test.describe("R2-2b custom notes", () => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL + ADMIN_PASSWORD + service role");

  test("flagged design shows the note block; custom mode reveals a focused textarea; note rides URL", async ({
    page,
  }) => {
    // (a) Discover the first active design (needs id for admin URL, slug for public URL).
    const design = await firstActiveDesignWithId();

    // (b) Via admin UI: ensure design-accepts-notes is CHECKED, then save.
    // This triggers revalidateTag("catalog") via saveDesign server action.
    await loginAdmin(page);
    await page.goto(`/admin/designs/${design.id}`);
    const checkbox = page.getByTestId("design-accepts-notes");
    await expect(checkbox).toBeVisible();
    const wasChecked = await checkbox.isChecked();
    if (!wasChecked) {
      await checkbox.click();
    }
    await page.getByTestId("design-save").click();
    // Wait for the post-save redirect to /admin/designs (confirms catalog revalidated).
    await expect(page).toHaveURL(/\/admin\/designs$/);

    try {
      // (c) Public configurator — step 2 with the flagged design.
      await page.goto(`/no/configurator?design=${design.slug}&step=2`);

      // AC2: custom-notes block is visible when flag is set.
      const block = page.getByTestId("custom-notes");
      await expect(block).toBeVisible();

      // AC3 default mode: no textarea rendered.
      await expect(page.getByTestId("custom-notes-text")).toHaveCount(0);

      // AC3 custom mode: click "I'll choose myself" → textarea appears, focused, helper visible.
      await page.getByTestId("custom-notes-custom").click();
      const textarea = page.getByTestId("custom-notes-text");
      await expect(textarea).toBeFocused();
      await expect(page.getByTestId("custom-notes-helper")).toBeVisible();

      // Fill the note.
      await textarea.fill("brun hund med hvite flekker");

      // AC4/AC8: note rides the URL when advancing to step 3.
      await page.getByTestId("next-step").click();
      await expect(page).toHaveURL(/note=/);

      // (e) AC2 off-case: a second active design (without the flag) should NOT
      // show the custom-notes block. If only one design exists, skip gracefully
      // (covered by the unit test in Task 4).
      const second = await secondActiveDesignWithId();
      if (second) {
        await page.goto(`/no/configurator?design=${second.slug}&step=2`);
        // The second design has accepts_custom_notes = false → block must be absent.
        await expect(page.getByTestId("custom-notes")).toHaveCount(0);
      }
      // else: only one active design; AC2 off-case is covered by unit tests (Task 4).
    } finally {
      // (d) RESTORE: navigate back to admin, UNCHECK the flag, save (revalidates cache).
      await page.goto(`/admin/designs/${design.id}`);
      const restoreCheckbox = page.getByTestId("design-accepts-notes");
      await expect(restoreCheckbox).toBeVisible();
      if (await restoreCheckbox.isChecked()) {
        await restoreCheckbox.click();
      }
      await page.getByTestId("design-save").click();
      await expect(page).toHaveURL(/\/admin\/designs$/);
    }
  });
});
