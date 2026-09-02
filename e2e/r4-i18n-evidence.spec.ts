import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  ADMIN_READY,
  CAN_SEED,
  adminClient,
  assertSeedingAllowed,
  loadEnvLocal,
  loginAdmin,
} from "./helpers";

/**
 * R4-I18N evidence (tooling, NOT a gate) — the four states the card is judged
 * on, plus the journey the client actually cares about: a text saved from
 * /admin/texts showing up on the public site with no deploy in between.
 *
 * `playwright.config.ts` gives evidence specs their own project
 * (`testMatch: /evidence\.spec\.ts$/`) that neither `make run-e2e-core` nor
 * `make run-e2e` ever matches — so this file adds no gate surface. Run it
 * directly:
 *
 *   MK_E2E_SEED=1 npx playwright test e2e/r4-i18n-evidence.spec.ts --project=evidence
 *
 * This spec writes to the REAL i18n_overrides table — the same table the
 * public site reads through `getMessages` (src/i18n/overrides.server.ts).
 * Same blast radius as the discount/order seeders, so the same guard:
 * `assertSeedingAllowed()` (project-ref allowlist + `MK_E2E_SEED=1`) plus a
 * declared `CAN_SEED` skip (lezione F07) — nobody runs this by accident.
 *
 * Only two keys are ever written — `footer.copyright` (states 1-4) and
 * `configurator.step1.hero.title` (state 5, the journey) — and each test
 * puts its own key back to "no override" in a `finally`, then reads the row
 * back with the SERVICE-ROLE client to prove the delete actually landed
 * (`e2e/r4-sconti-evidence.spec.ts`'s `restore()` and
 * `actions.integration.test.ts`'s cleanup both throw loudly on a failed
 * restore instead of swallowing — this does the same). Everything the UI
 * itself resets along the way (state 4's Reset click) already leaves the row
 * gone before the `finally` runs; the `finally` is the belt, not the only
 * strap.
 */
loadEnvLocal();
const OUT = "docs/evidence/r4-i18n";
mkdirSync(OUT, { recursive: true });

test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");
test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: questo spec scrive in i18n_overrides");

/** The three widths this card's DoD names — the closed row was reworked for
 *  the narrow one, so 375 is the interesting shot, not decoration. */
const SIZES = [
  { label: "375", width: 375, height: 900 },
  { label: "768", width: 768, height: 900 },
  { label: "1280", width: 1280, height: 900 },
] as const;

const COPYRIGHT_KEY = "footer.copyright";
const HERO_KEY = "configurator.step1.hero.title";

/** The toggle header is always the FIRST button in the row (save/reset only
 *  render once the row is open, and they come after it in the JSX). */
const toggle = (page: Page, key: string) =>
  page.getByTestId(`row-${key}`).locator("button").first();

async function gotoTexts(page: Page) {
  await page.goto("/admin/texts");
  await page.getByTestId("texts-editor").waitFor();
}

/**
 * Permanent guard for the 375px overflow this evidence run found: a review
 * had computed "no overflow" from class names alone (AdminShell's `<main>`
 * is `max-w-[1040px] flex-1` with no `min-w-0` — a flex item defaults to
 * `min-width: auto` and refuses to shrink below its content) and a real
 * browser disagreed (`scrollWidth` 1040 vs a 375 viewport, unfiltered list;
 * 423 vs 375 with a row open, from the Save/Reset row having no `flex-wrap`).
 * Measured, not derived — so the check stays measured too.
 */
async function assertNoHorizontalOverflow(page: Page, where: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${where}: horizontal overflow (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`).toBeLessThanOrEqual(clientWidth);
}

/** Deletes both locale rows for a key and PROVES they are gone — a silent
 *  failed restore would leave the shop's staging copy overridden forever. */
async function assertNoOverride(key: string) {
  const db = adminClient();
  const del = await db.from("i18n_overrides").delete().eq("key", key);
  if (del.error) {
    throw new Error(`[e2e evidence] FAILED to restore "${key}": ${del.error.message}`);
  }
  const check = await db.from("i18n_overrides").select("locale").eq("key", key);
  if (check.error) {
    throw new Error(`[e2e evidence] FAILED to verify restore of "${key}": ${check.error.message}`);
  }
  expect(check.data, `"${key}" still has an override after restore`).toHaveLength(0);
}

test.describe("admin: Texts editor — search, edit, placeholder guard, reset", () => {
  test.describe.configure({ timeout: 120_000 });

  test(`${COPYRIGHT_KEY} @375/@768/@1280`, async ({ page }) => {
    assertSeedingAllowed();
    try {
      await loginAdmin(page);

      for (const { label, width, height } of SIZES) {
        await page.setViewportSize({ width, height });
        await gotoTexts(page);

        // ── 1. search in progress — narrowed to the one matching row, both
        // language columns and the key visible ──────────────────────────────
        await page.getByTestId("texts-search").fill("copyright");
        const rows = page.locator('[data-testid^="row-"]');
        await expect(rows).toHaveCount(1);
        await expect(page.getByTestId(`row-${COPYRIGHT_KEY}`)).toBeVisible();
        await expect(page.getByTestId(`row-${COPYRIGHT_KEY}`)).toContainText(COPYRIGHT_KEY);
        await expect(page.getByTestId(`row-${COPYRIGHT_KEY}`)).toContainText("Min Keramikk");
        if (label === "375") await assertNoHorizontalOverflow(page, "375 — list");
        await page.screenshot({ path: `${OUT}/1-search-${label}.png` });

        // ── 2. the two-column edit open ───────────────────────────────────
        await toggle(page, COPYRIGHT_KEY).click();
        await expect(page.getByTestId(`edit-no-${COPYRIGHT_KEY}`)).toBeVisible();
        await expect(page.getByTestId(`edit-en-${COPYRIGHT_KEY}`)).toBeVisible();
        if (label === "375") await assertNoHorizontalOverflow(page, "375 — row open, editor + buttons");
        await page.screenshot({ path: `${OUT}/2-edit-open-${label}.png` });

        // ── 3. the placeholder error — drop {year} from the Norwegian field
        await page.getByTestId(`edit-no-${COPYRIGHT_KEY}`).fill("© Min Keramikk");
        await page.getByTestId(`save-${COPYRIGHT_KEY}`).click();
        const error = page.getByTestId(`error-${COPYRIGHT_KEY}`);
        await expect(error).toBeVisible();
        await expect(error).toContainText("{year}");
        await expect(error).toContainText(/missing/i);
        await page.screenshot({ path: `${OUT}/3-placeholder-error-${label}.png` });

        // ── 4a. fix it and save for real, so the row carries an "edited"
        // marker to reset — placeholder kept, wording changed ──────────────
        await page
          .getByTestId(`edit-no-${COPYRIGHT_KEY}`)
          .fill(`© {year} Min Keramikk (${label} evidence)`);
        await page.getByTestId(`save-${COPYRIGHT_KEY}`).click();
        await expect(error).toBeHidden();
        await expect(page.getByTestId(`overridden-${COPYRIGHT_KEY}`)).toBeVisible();
        // closed-row screenshot: the header's key/no/en spans are plain React
        // text bound to the current props, so this — unlike the textarea's
        // uncontrolled defaultValue — always shows what is actually saved.
        await toggle(page, COPYRIGHT_KEY).click();
        await expect(page.getByTestId(`row-${COPYRIGHT_KEY}`)).toContainText(`(${label} evidence)`);
        await page.screenshot({ path: `${OUT}/4a-edited-marker-${label}.png` });

        // ── 4b. Reset — the marker is gone, the text is back to the shipped
        // original ───────────────────────────────────────────────────────
        await toggle(page, COPYRIGHT_KEY).click();
        await page.getByTestId(`reset-${COPYRIGHT_KEY}`).click();
        await expect(page.getByTestId(`overridden-${COPYRIGHT_KEY}`)).toHaveCount(0);
        await toggle(page, COPYRIGHT_KEY).click();
        await expect(page.getByTestId(`row-${COPYRIGHT_KEY}`)).toContainText("© {year} Min Keramikk");
        await expect(page.getByTestId(`row-${COPYRIGHT_KEY}`)).not.toContainText("evidence");
        await page.screenshot({ path: `${OUT}/4b-after-reset-${label}.png` });
      }
    } finally {
      await assertNoOverride(COPYRIGHT_KEY);
    }
  });
});

test.describe("the journey: save a new NO title, see it on the public page", () => {
  test.describe.configure({ timeout: 120_000 });

  test("configurator.step1.hero.title — admin save → /no/configurator", async ({ browser }) => {
    assertSeedingAllowed();
    const VIEWPORT = { width: 1280, height: 900 };
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: `${OUT}/video-tmp`, size: VIEWPORT },
    });
    const page = await context.newPage();
    const NEW_TITLE = "Lag din egen keramikk i 3 steg — R4-I18N evidence";

    try {
      // ── before: the shipped title on the public page ────────────────────
      await page.goto("/no/configurator");
      const hero = page.getByTestId("step1-hero");
      await expect(hero).toBeVisible();
      await expect(hero).not.toContainText("R4-I18N evidence");
      await page.screenshot({ path: `${OUT}/5-before-public.png`, fullPage: true });

      // ── the edit, in the admin panel ─────────────────────────────────────
      await loginAdmin(page);
      await gotoTexts(page);
      await page.getByTestId("texts-search").fill("step1.hero.title");
      await expect(page.locator('[data-testid^="row-"]')).toHaveCount(1);
      await toggle(page, HERO_KEY).click();
      await page.getByTestId(`edit-no-${HERO_KEY}`).fill(NEW_TITLE);
      await page.getByTestId(`save-${HERO_KEY}`).click();
      await expect(page.getByTestId(`error-${HERO_KEY}`)).toHaveCount(0);
      await expect(page.getByTestId(`overridden-${HERO_KEY}`)).toBeVisible();

      // ── after: same page, no deploy in between, the new title is live.
      // The save action revalidates the "i18n" tag synchronously, so this
      // should show up on the first load — the retry is only a guard against
      // the same kind of caching lag r4-sconti/r4-takk's evidence specs
      // already defend against, not a known issue here. ────────────────────
      await expect(async () => {
        await page.goto("/no/configurator");
        await expect(hero).toContainText("R4-I18N evidence");
      }).toPass({ timeout: 15_000 });
      await page.screenshot({ path: `${OUT}/5-after-public.png`, fullPage: true });
    } finally {
      await context.close();
      await page.video()?.saveAs(`${OUT}/5-journey-save-and-see.webm`);
      await assertNoOverride(HERO_KEY);
    }
  });
});
