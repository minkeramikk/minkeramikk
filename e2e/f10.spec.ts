import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, loadEnvLocal } from "./helpers";

/** F10a — configurator designs + categories (back-office) + preview.
 *  RLS-negative runs always; the admin flow needs a seeded admin. */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasAdmin = Boolean(EMAIL && PASSWORD);

const NAME = `E2E F10 Design ${Date.now()}`;

const OPT = `E2E F10b Opt ${Date.now()}`;

test.afterAll(async () => {
  const db = adminClient();
  // CASCADE removes its categories/options
  await db.from("designs").delete().like("name", "E2E F10 Design%");
  await db.from("options").delete().like("name", "E2E F10b Opt%");
});

test("RLS: anon cannot insert a design or a category", async () => {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const d = await anon.from("designs").insert({
    slug: "e2e-anon-design",
    supplier_id: "00000000-0000-4000-8000-000000000000",
    name: "x",
  });
  expect(d.error).not.toBeNull();
  const c = await anon.from("option_categories").insert({
    design_id: "00000000-0000-4000-8000-000000000000",
    slug: "x",
    label_no: "x",
    label_en: "x",
    kind: "color",
    layer_slot: "base",
  });
  expect(c.error).not.toBeNull();
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("AC: create design (code auto) → add category → activate → shows in configurator; draft hides it", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");

  await login(page);

  // create (default: draft / not active)
  await page.goto("/admin/designs/new");
  await page.getByTestId("design-name").fill(NAME);
  await page.getByTestId("design-supplier").selectOption({ label: "Vietri" });
  await page.getByTestId("design-save").click();

  // landed on the detail page, with a code assigned (ADR 0011)
  await expect(page).toHaveURL(/\/admin\/designs\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("design-detail")).toBeVisible();
  await expect(page.getByTestId("design-detail")).toHaveAttribute("data-active", "false");

  // add a category
  const add = page.getByTestId("add-category-form");
  await add.getByLabel("Label NO").fill("Farge");
  await add.getByLabel("Label EN").fill("Colour");
  await page.getByTestId("category-add").click();
  await expect(page.getByTestId("category-row")).toHaveCount(1);

  // draft → NOT in the public configurator
  await page.goto("/no/configurator");
  await expect(page.getByText(NAME)).toHaveCount(0);

  // activate + save
  await page.goto("/admin/designs");
  await page
    .locator('[data-testid="design-row"]', { hasText: NAME })
    .getByTestId("design-edit")
    .click();
  await page.getByTestId("design-active").check();
  await page.getByTestId("design-save").click();
  await expect(page).toHaveURL(/\/admin\/designs$/);

  // now visible in the configurator step 1
  await page.goto("/no/configurator");
  await expect(page.getByText(NAME)).toBeVisible();
});

test("AC: an invalid preview upload is rejected with a form error", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");
  await login(page);
  await page.goto("/admin/designs/new");
  await page.getByTestId("design-name").fill("E2E F10 Design BadUpload");
  await page.getByTestId("design-supplier").selectOption({ label: "Vietri" });
  await page.getByTestId("design-preview-image").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page.getByTestId("design-save").click();
  await expect(page.getByTestId("design-error")).toBeVisible();
});

// ── F10b: options + asset upload + anti-duplicate (0009 indexes live) ──

test("RLS: anon cannot insert an option", async () => {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error } = await anon.from("options").insert({
    category_id: "00000000-0000-4000-8000-000000000000",
    name: "e2e anon opt",
    hex: "#123456",
  });
  expect(error).not.toBeNull();
});

test("AC: add a colour option → shows in step 2; duplicate hex/name rejected", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");
  const db = adminClient();
  // an active design's colour category (Blomster 1 → details)
  const { data: design } = await db.from("designs").select("id").eq("slug", "blomster-1").single();
  const { data: cat } = await db
    .from("option_categories")
    .select("id")
    .eq("design_id", design!.id)
    .eq("slug", "details")
    .single();

  await login(page);
  await page.goto(`/admin/designs/${design!.id}/categories/${cat!.id}`);
  const add = page.getByTestId("add-option-form");
  const rows = page.getByTestId("option-row");
  const before = await rows.count();

  // add a unique option → one more row, no error
  await add.getByLabel("Name").fill(OPT);
  await add.getByLabel("Hex").fill("#123456");
  await page.getByTestId("option-add").click();
  await expect(rows).toHaveCount(before + 1);
  await expect(page.getByTestId("add-option-error")).toHaveCount(0);

  // duplicate HEX → rejected
  await add.getByLabel("Name").fill(`${OPT} two`);
  await add.getByLabel("Hex").fill("#123456");
  await page.getByTestId("option-add").click();
  await expect(page.getByTestId("add-option-error")).toContainText(/hex/i);

  // duplicate NAME → rejected
  await add.getByLabel("Name").fill(OPT);
  await add.getByLabel("Hex").fill("#654321");
  await page.getByTestId("option-add").click();
  await expect(page.getByTestId("add-option-error")).toContainText(/name/i);

  // the option is live in the public configurator step 2 (swatch by aria-label)
  await page.goto("/no/configurator?design=blomster-1&step=2");
  await page.getByTestId("details-step").waitFor();
  await expect(page.getByRole("radio", { name: OPT })).toBeVisible();
});

test("AC: option image-or-hex rule — neither provided → rejected", async ({
  page,
}) => {
  test.skip(!hasAdmin, "needs a seeded admin");
  const db = adminClient();
  const { data: design } = await db.from("designs").select("id").eq("slug", "blomster-1").single();
  const { data: cat } = await db
    .from("option_categories")
    .select("id")
    .eq("design_id", design!.id)
    .eq("slug", "details")
    .single();

  await login(page);
  await page.goto(`/admin/designs/${design!.id}/categories/${cat!.id}`);
  const add = page.getByTestId("add-option-form");
  await add.getByLabel("Name").fill("E2E F10b Opt nohexnoimg");
  // no hex, no image
  await page.getByTestId("option-add").click();
  await expect(page.getByTestId("add-option-error")).toContainText(/hex colour or a swatch/i);
});
