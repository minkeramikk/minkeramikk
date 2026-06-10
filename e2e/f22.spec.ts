import { test, expect, type Page } from "@playwright/test";
import { adminClient, loadEnvLocal } from "./helpers";

/**
 * F22 — New design from template + accordion tree (back-office).
 *
 * Requires ADMIN_EMAIL/PASSWORD + service-role key (same gate as F07).
 */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasService = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
);
const ready = Boolean(EMAIL && PASSWORD) && hasService;

const createdIds: string[] = [];

test.afterAll(async () => {
  if (!ready) return;
  const db = adminClient();
  for (const id of createdIds) {
    // CASCADE removes categories + options
    await db.from("designs").delete().eq("id", id);
  }
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
}

// ── AC1: wizard UI ───────────────────────────────────────────────────────────

test("AC1: new-design page shows 3 template tiles + supplier select", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds");
  await login(page);
  await page.goto("/admin/designs/new");

  await expect(page.getByTestId("template-wizard")).toBeVisible();
  await expect(page.getByTestId("template-tile-empty")).toBeVisible();
  await expect(page.getByTestId("template-tile-colors-only")).toBeVisible();
  await expect(page.getByTestId("template-tile-colors-and-logos")).toBeVisible();
  await expect(page.getByTestId("wizard-supplier")).toBeVisible();
  await expect(page.getByTestId("wizard-name")).toBeVisible();
  await expect(page.getByTestId("wizard-submit")).toBeVisible();
});

test("AC1: tiles are radio-selectable and one is checked by default", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds");
  await login(page);
  await page.goto("/admin/designs/new");

  // "empty" is selected by default — its radio is checked
  const emptyRadio = page
    .getByTestId("template-tile-empty")
    .locator('input[type="radio"]');
  await expect(emptyRadio).toBeChecked();

  // clicking another tile selects it
  await page.getByTestId("template-tile-colors-only").click();
  const colorsRadio = page
    .getByTestId("template-tile-colors-only")
    .locator('input[type="radio"]');
  await expect(colorsRadio).toBeChecked();
  await expect(emptyRadio).not.toBeChecked();
});

// ── AC2: empty template ──────────────────────────────────────────────────────

test("AC2: 'Vuoto' creates a design with no categories", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/designs/new");

  // "empty" is selected by default; just pick a supplier + name
  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`F22 Empty ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();

  // lands on the design detail page
  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("design-detail")).toBeVisible();

  // tree is shown but no category accordions
  await expect(page.getByTestId("design-tree")).toBeVisible();
  await expect(page.getByTestId("category-accordion")).toHaveCount(0);

  // design is a draft (active=false)
  await expect(page.getByTestId("design-detail")).toHaveAttribute("data-active", "false");

  // record for cleanup
  const id = page.url().split("/").pop()!;
  createdIds.push(id);
});

// ── AC3: Solo colori template ────────────────────────────────────────────────

test("AC3: 'Solo colori' creates design with Colour category + 21 palette options", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/designs/new");

  await page.getByTestId("template-tile-colors-only").click();
  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`F22 Colors ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();

  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("design-tree")).toBeVisible();

  // one category accordion
  await expect(page.getByTestId("category-accordion")).toHaveCount(1);

  // expand it → 21 option rows
  await page.getByTestId("category-summary").first().click();
  await expect(page.getByTestId("tree-option-row")).toHaveCount(21);

  createdIds.push(page.url().split("/").pop()!);
});

test("AC3: 'Colori + loghi' creates design with 2 categories", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/designs/new");

  await page.getByTestId("template-tile-colors-and-logos").click();
  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`F22 Full ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();

  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  // two category accordions: Colour + Animal
  await expect(page.getByTestId("category-accordion")).toHaveCount(2);

  createdIds.push(page.url().split("/").pop()!);
});

// ── AC4: tree expand/collapse + add option + add category ────────────────────

test("AC4: tree — expand/collapse category accordion", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/designs/new");

  await page.getByTestId("template-tile-colors-only").click();
  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`F22 Accordion ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();

  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);

  const details = page.getByTestId("category-accordion").first();

  // starts collapsed — options list not visible
  await expect(page.getByTestId("tree-options-list")).toHaveCount(0);

  // expand
  await page.getByTestId("category-summary").first().click();
  await expect(page.getByTestId("tree-options-list")).toBeVisible();
  await expect(page.getByTestId("tree-option-row")).toHaveCount(21);

  // collapse
  await page.getByTestId("category-summary").first().click();
  await expect(details).not.toHaveAttribute("open");

  createdIds.push(page.url().split("/").pop()!);
});

test("AC4: tree — add a category from the bottom form", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/designs/new");

  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`F22 AddCat ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();

  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("design-tree")).toBeVisible();

  // open add-category form
  await page.getByTestId("add-category-button").click();
  await expect(page.getByTestId("add-category-form")).toBeVisible();

  // fill labels
  await page.getByRole("textbox", { name: "Label NO" }).fill("Fargevalg");
  await page.getByRole("textbox", { name: "Label EN" }).fill("Colour");
  await page.getByTestId("add-category-submit").click();

  // category appears
  await expect(page.getByTestId("category-accordion")).toHaveCount(1);
  await expect(page.getByText("Colour")).toBeVisible();

  createdIds.push(page.url().split("/").pop()!);
});

test("AC4: tree — add an option inline", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await login(page);
  await page.goto("/admin/designs/new");

  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`F22 AddOpt ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();

  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);

  // add a category first
  await page.getByTestId("add-category-button").click();
  await page.getByRole("textbox", { name: "Label NO" }).fill("Farge");
  await page.getByRole("textbox", { name: "Label EN" }).fill("Colour");
  await page.getByTestId("add-category-submit").click();
  await expect(page.getByTestId("category-accordion")).toHaveCount(1);

  // expand it
  await page.getByTestId("category-summary").first().click();

  // click "+ Add option"
  await page.getByTestId("tree-add-option").click();
  await expect(page.getByTestId("inline-add-option-form")).toBeVisible();

  // fill and submit
  await page.getByRole("textbox", { name: "Option name" }).fill("Blå");
  await page.getByRole("textbox", { name: "Hex colour" }).fill("#0000ff");
  await page.getByTestId("inline-add-option-submit").click();

  // option appears
  await expect(page.getByTestId("tree-option-row")).toHaveCount(1);

  createdIds.push(page.url().split("/").pop()!);
});

// ── F22-fix: compositing layer in add/edit + warning + delete ────────────────

async function newColorsDesign(page: Page, label: string) {
  await login(page);
  await page.goto("/admin/designs/new");
  await page.getByTestId("template-tile-colors-only").click();
  await page.getByTestId("wizard-supplier").selectOption({ index: 1 });
  await page.getByTestId("wizard-name").clear();
  await page.getByTestId("wizard-name").fill(`${label} ${Date.now()}`);
  await page.getByTestId("wizard-submit").click();
  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  createdIds.push(page.url().split("/").pop()!);
}

test("fix: add-option form exposes the compositing layer field", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await newColorsDesign(page, "Fix AddLayer");
  await page.getByTestId("category-summary").first().click();
  await page.getByTestId("tree-add-option").click();
  await expect(page.getByTestId("inline-add-option-form")).toBeVisible();
  await expect(page.getByTestId("inline-add-option-layer")).toBeVisible();
});

test("fix: options without a layer show a warning (option + category)", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await newColorsDesign(page, "Fix Warning");
  // the template seeds 21 colours with no compositing layer → category warning
  await expect(page.getByTestId("category-missing-layers")).toContainText("21");
  await page.getByTestId("category-summary").first().click();
  await expect(page.getByTestId("option-no-layer").first()).toBeVisible();
  await expect(page.getByTestId("option-no-layer")).toHaveCount(21);
});

test("fix: an existing option can be edited (layer field present); name persists", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await newColorsDesign(page, "Fix Edit");
  await page.getByTestId("category-summary").first().click();

  await page.getByTestId("tree-option-edit").first().click();
  const form = page.getByTestId("tree-option-edit-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("tree-option-edit-layer")).toBeVisible();

  const newName = `Edited ${Date.now()}`;
  await form.getByRole("textbox", { name: "Option name" }).fill(newName);
  await page.getByTestId("tree-option-edit-save").click();
  await expect(page.getByTestId("tree-options-list")).toContainText(newName);
});

test("fix: choosing a layer file shows an inline thumbnail preview", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  await newColorsDesign(page, "Fix Preview");
  await page.getByTestId("category-summary").first().click();
  await page.getByTestId("tree-add-option").click();
  // 1×1 transparent PNG, in-memory (no fixture file)
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  await page
    .getByTestId("inline-add-option-layer")
    .setInputFiles({ name: "layer.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("inline-add-option-layer-thumb")).toBeVisible();
});

test("fix: a design can be deleted behind a confirmation", async ({ page }) => {
  test.skip(!ready, "needs admin creds + service role");
  await newColorsDesign(page, "Fix Delete");
  const id = page.url().split("/").pop()!;

  await expect(page.getByTestId("delete-design")).toBeVisible();
  await page.getByTestId("delete-design-trigger").click();
  await page.getByTestId("delete-design-confirm").click();

  // redirected to the list; the design is gone
  await page.waitForURL(/\/admin\/designs$/);
  await expect(page.locator(`[data-testid="design-edit"][href$="/${id}"]`)).toHaveCount(0);
});

test("fix: duplicate copies the design's owned assets; delete frees them", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  const db = adminClient();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  // seed a source design with ONE owned layer asset in Storage
  const { data: supplier } = await db.from("suppliers").select("id").limit(1).single();
  const stamp = Date.now();
  const srcSlug = `dup-src-${stamp}`;
  const srcLayer = `designs/${srcSlug}/farge/lilla-layer.png`;
  await db.storage.from("assets").upload(srcLayer, png, {
    contentType: "image/png",
    upsert: true,
  });
  const { data: srcDesign } = await db
    .from("designs")
    .insert({ name: `Dup Source ${stamp}`, slug: srcSlug, supplier_id: supplier!.id, active: true })
    .select("id")
    .single();
  createdIds.push(srcDesign!.id);
  const { data: cat } = await db
    .from("option_categories")
    .insert({ design_id: srcDesign!.id, slug: "farge", label_no: "Farge", label_en: "Colour", kind: "color", layer_slot: "base", sort_order: 0 })
    .select("id")
    .single();
  await db.from("options").insert({
    category_id: cat!.id, name: "Lilla", hex: "#a3759f",
    image: "swatches/a3759f.png", layer_image: srcLayer, sort_order: 0, active: true,
  });

  // duplicate from the list
  await login(page);
  await page.goto("/admin/designs");
  await page
    .getByTestId("design-row")
    .filter({ hasText: `Dup Source ${stamp}` })
    .getByTestId("design-duplicate")
    .click();
  await page.waitForURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  const cloneId = page.url().split("/").pop()!;
  createdIds.push(cloneId);

  // the clone's layer was COPIED to its own folder (not the source path), and exists
  const { data: clone } = await db
    .from("designs")
    .select("slug, option_categories(options(layer_image))")
    .eq("id", cloneId)
    .single();
  const cats = clone!.option_categories as unknown as { options: { layer_image: string }[] }[];
  const cloneLayer = cats[0].options[0].layer_image;
  expect(cloneLayer.startsWith(`designs/${clone!.slug}/`)).toBe(true);
  expect(cloneLayer).not.toBe(srcLayer);
  const dir = cloneLayer.split("/").slice(0, -1).join("/");
  const file = cloneLayer.split("/").pop()!;
  const listed = await db.storage.from("assets").list(dir);
  expect((listed.data ?? []).some((o) => o.name === file)).toBe(true);

  // delete the clone via the UI → its Storage object is freed
  await page.goto(`/admin/designs/${cloneId}`);
  await page.getByTestId("delete-design-trigger").click();
  await page.getByTestId("delete-design-confirm").click();
  await page.waitForURL(/\/admin\/designs$/);
  const after = await db.storage.from("assets").list(dir);
  expect((after.data ?? []).some((o) => o.name === file)).toBe(false);

  // free the source's Storage object (the DB row is cleaned by afterAll)
  await db.storage.from("assets").remove([srcLayer]);
});

test("New design: start from an existing design clones it into a draft editor", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds");
  await login(page);
  await page.goto("/admin/designs/new");

  // the page leads with a picker of existing designs to start from
  await expect(page.getByTestId("design-starters")).toBeVisible();
  const starter = page.getByTestId("start-from-design").first();
  await expect(starter).toBeVisible();

  // clone → land in the new draft editor (a "(copy)", not active)
  await starter.click();
  await expect(page).toHaveURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  createdIds.push(page.url().split("/").pop()!);
  await expect(page.getByTestId("design-detail")).toBeVisible();
  await expect(page.getByTestId("design-detail")).toHaveAttribute(
    "data-active",
    "false"
  );

  // the blank-template path is still available as a secondary option
  await page.goto("/admin/designs/new");
  await expect(page.getByTestId("start-blank")).toBeVisible();
  await expect(page.getByTestId("template-wizard")).toBeVisible();
});

test("fix: a blank active design at the front doesn't blank the configurator default", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  const db = adminClient();
  const { data: supplier } = await db.from("suppliers").select("id").limit(1).single();
  const stamp = Date.now();
  const { data: d } = await db
    .from("designs")
    .insert({ name: `Blank Front ${stamp}`, slug: `blank-front-${stamp}`, supplier_id: supplier!.id, active: true, sort_order: -100 })
    .select("id")
    .single();
  createdIds.push(d!.id);
  const { data: cat } = await db
    .from("option_categories")
    .insert({ design_id: d!.id, slug: "farge", label_no: "F", label_en: "Colour", kind: "color", layer_slot: "base", sort_order: 0 })
    .select("id")
    .single();
  await db.from("options").insert({ category_id: cat!.id, name: "X", hex: "#123456", sort_order: 0, active: true });

  // the configurator's DEFAULT view must still compose (skip the blank design)
  await page.goto("/no/configurator");
  await page.getByTestId("design-step").waitFor();
  const imgCount = await page.locator('[data-testid="preview-canvas"] img').count();
  expect(imgCount).toBeGreaterThan(0);
});

// ── AC5: draft gate — draft design not visible in public configurator ─────────

test("AC5: draft design does not appear in the public configurator", async ({
  page,
}) => {
  test.skip(!ready, "needs admin creds + service role");
  const db = adminClient();

  const { data: supplier } = await db
    .from("suppliers")
    .select("id")
    .limit(1)
    .single();
  const slug = `f22-draft-${Date.now()}`;
  const { data: design } = await db
    .from("designs")
    .insert({
      name: "F22 Draft Gate",
      slug,
      supplier_id: supplier!.id,
      active: false,
    })
    .select("id, slug")
    .single();

  createdIds.push(design!.id);

  // The configurator design selector must NOT show this draft
  await page.goto("/no/configurator");
  // Wait for the page to load — the design selector may be a list or step
  await page.waitForLoadState("networkidle");

  // No element with this slug should be rendered
  const slugEl = page.locator(`[data-slug="${slug}"]`);
  await expect(slugEl).toHaveCount(0);
});
