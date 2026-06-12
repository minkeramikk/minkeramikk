import { test, expect, type Page } from "@playwright/test";
import { adminClient, loadEnvLocal } from "./helpers";

/** F28 — Popular designs: ONE desktop e2e covering BOTH featured kinds in a
 *  single ride (card test plan): admin adds a design (by raw code) and a set
 *  (by app link) → home shows both cards (badge on the set) → click the
 *  design → step 2 with that config → back → click the set → step 3 with
 *  the basket loaded. Everything else (parser, validations, cap, labels,
 *  RLS) lives in unit tests. Needs a seeded admin, like f06. */

loadEnvLocal();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const hasAdmin = Boolean(EMAIL && PASSWORD);

const DESIGN_CODE = "MK-A"; // blomster-1 with default options
const SET_LINK =
  "/no/configurator?step=3&set=MK-A.vietri-flat.2~MK-A.vietri-dyp.1";

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(EMAIL!);
  await page.getByTestId("login-password").fill(PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function addFeatured(page: Page, input: string) {
  await page.goto("/admin/featured");
  await page.getByTestId("featured-input").fill(input);
  await page.getByTestId("featured-preview-btn").click();
  await expect(page.getByTestId("featured-preview")).toBeVisible();
  await page.getByTestId("featured-add-btn").click();
  await expect(page.getByTestId("featured-preview")).toHaveCount(0); // saved → list view
}

test.afterAll(async () => {
  // cleanup: rows + their pre-composed thumbs (the action owns featured/<id>.webp)
  const admin = adminClient();
  const { data } = await admin
    .from("featured_configs")
    .select("id, thumb_image")
    .in("payload", [DESIGN_CODE, "MK-A.vietri-flat.2~MK-A.vietri-dyp.1"]);
  for (const row of data ?? []) {
    await admin.from("featured_configs").delete().eq("id", row.id);
    await admin.storage.from("assets").remove([row.thumb_image]);
  }
});

test("F28 round-trip: admin curates design+set → home strip → both landings work", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only by test policy");
  test.skip(!hasAdmin, "needs ADMIN_EMAIL/ADMIN_PASSWORD (seeded admin)");

  // ── admin: one featured per kind, via the paste-anything input ──
  await adminLogin(page);
  // the table may hold real curation: assert DELTAS, touch only our rows
  await page.goto("/admin/featured");
  const baseline = await page.getByTestId("featured-row").count();
  await addFeatured(page, DESIGN_CODE); // raw config code → kind=design
  await addFeatured(page, SET_LINK); // app link with ?set= → kind=set
  await expect(page.getByTestId("featured-row")).toHaveCount(baseline + 2);

  // reorder: our two rows are the LAST two (sort = max+1) — ↑ on the last
  // swaps them without touching anyone else's order (regression: direction
  // must reach the action; React drops the submitter's name/value)
  const lastPayload = () =>
    page
      .getByTestId("featured-row")
      .last()
      .locator("td[class*='font-mono']")
      .innerText();
  const beforeMove = await lastPayload();
  await page.getByTestId("featured-move-up").last().click();
  await expect
    .poll(async () => lastPayload(), { timeout: 10_000 })
    .not.toBe(beforeMove);

  // ── home: strip with both OUR cards, badge on the set (other curated
  // rows may coexist → locate by our payloads) ──
  await page.goto("/no/configurator");
  const strip = page.getByTestId("featured-strip");
  await expect(strip).toBeVisible();
  const designCard = strip.locator(
    '[data-testid="featured-card-design"][href*="code=MK-A&"]'
  );
  const setCard = strip.locator(
    '[data-testid="featured-card-set"][href*="vietri-flat"]'
  );
  await expect(designCard).toBeVisible();
  await expect(setCard).toBeVisible();
  await expect(setCard.getByTestId("featured-set-badge")).toContainText("3");
  // pre-composed thumb: ONE image per card, from featured/, no layer stacks
  await expect(designCard.locator("img")).toHaveAttribute(
    "src",
    /featured\/.+\.webp/
  );

  // ── click the design card → step 2 with THAT config loaded (decode-once) ──
  await designCard.click();
  await expect(page.getByTestId("details-step")).toBeVisible();
  await expect(page).toHaveURL(/design=blomster-1/);
  await expect(page).not.toHaveURL(/code=/); // consumed
  await expect(page.getByTestId("config-code")).toHaveText(/^MK-A/);

  // ── back to the home, click the set card → CA-3 landing on step 3 ──
  await page.goto("/no/configurator");
  await setCard.click();
  await expect(page.getByTestId("ceramics-step")).toBeVisible();
  const panel = page.getByTestId("docked-cart-panel");
  await expect(panel.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("shared-set-banner")).toBeVisible();
  await expect(page).not.toHaveURL(/set=/); // consumed (CA-3 decode-once)
});
