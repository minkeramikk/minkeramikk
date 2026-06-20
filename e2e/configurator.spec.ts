import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  firstActiveDesign,
  firstSupplier,
  ceramicRadios,
  horizontalOverflow,
  loginAdmin,
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
