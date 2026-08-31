import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_READY,
  adminClient,
  addFirstCeramic,
  firstActiveDesign,
  deleteOrder,
  loadEnvLocal,
} from "./helpers";

/**
 * R4-TAKK evidence (tooling, NOT a gate) — the thank-you page in the two states
 * the card is judged on: WITH the Vipps details configured and WITHOUT them
 * (settings empty → the payment block disappears whole and the page must still
 * read complete). NO and EN, 390 / 768 / 1280.
 *
 * One real order is submitted through the real flow, so the URL under the shots
 * is the one a customer actually lands on (code + set + the server's total),
 * and it is deleted in the `finally`. The Vipps settings are written live for
 * the duration of the test and restored from what was there before — same
 * pattern as e2e/r4-sconti-evidence.spec.ts.
 *
 * Skips cleanly when migration 0035 has not been applied to this database yet:
 * the settings write fails, and the WITH-settings half is simply not shot.
 *
 * Run: npx playwright test e2e/r4-takk-evidence.spec.ts --project=evidence
 */
loadEnvLocal();
const OUT = "docs/evidence/r4-takk";
mkdirSync(OUT, { recursive: true });

const WIDTHS = [390, 768, 1280] as const;
const LOCALES = ["no", "en"] as const;

/** The client's real QR (docs/client/vipps-qr.png), outside the repo. */
const QR_SRC = resolve(__dirname, "../../docs/client/vipps-qr.png");
const QR_PATH = "settings/vipps-qr-evidence.png";
const QR_LINK = "https://qr.vipps.no/vp/HTCB4pJcp";
const QR_NUMBER = "654321"; // placeholder — Alessio has not given the real one yet

type VippsRow = {
  vipps_qr_image: string | null;
  vipps_number: string | null;
  vipps_link: string | null;
};

async function shoot(page: Page, url: string, tag: string) {
  for (const locale of LOCALES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url.replace("/no/", `/${locale}/`));
      await page.getByTestId("order-confirmation").waitFor({ state: "visible" });
      await page.waitForTimeout(250); // let the mini-plate layers settle
      await page.screenshot({
        path: `${OUT}/takk-${tag}-${locale}-${width}.png`,
        fullPage: true,
      });
    }
  }
}

test("R4-TAKK: thank-you page with and without Vipps settings, NO/EN, 390/768/1280", async ({
  page,
}) => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");
  test.setTimeout(180_000);

  const db = adminClient();
  const design = await firstActiveDesign();
  let orderId = "";
  let before: VippsRow | null = null;

  try {
    // ── a real order, so the URL under the shots is a real one ───────────────
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/no/configurator?design=${design.slug}&step=3`);
    await addFirstCeramic(page);
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("order-form").waitFor();
    await page.getByTestId("order-name").fill("E2E Takk Evidence");
    await page.getByTestId("order-email").fill("e2e-takk@example.no");
    await page.getByTestId("order-submit").click();
    await expect(page.getByTestId("order-confirmation")).toBeVisible();
    const url = page.url();
    const code = await page.getByTestId("order-code").innerText();
    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("code", code)
      .single();
    orderId = (order as { id: string } | null)?.id ?? "";

    // ── what the DB had before we touch it (also: does 0035 exist here?) ─────
    const { data, error } = await db
      .from("settings")
      .select("vipps_qr_image, vipps_number, vipps_link")
      .eq("id", 1)
      .single();
    const migrated = !error;
    before = migrated ? (data as VippsRow) : null;

    // ── ① degraded: no payment details at all ───────────────────────────────
    if (migrated) {
      await db
        .from("settings")
        .update({ vipps_qr_image: null, vipps_number: null, vipps_link: null })
        .eq("id", 1);
    }
    await expect(page.getByTestId("order-payment")).toHaveCount(0);
    await shoot(page, url, "no-settings");

    // ── ② configured: QR + number ───────────────────────────────────────────
    if (migrated && existsSync(QR_SRC)) {
      await db.storage
        .from("assets")
        .upload(QR_PATH, readFileSync(QR_SRC), {
          contentType: "image/png",
          upsert: true,
        });
      await db
        .from("settings")
        .update({
          vipps_qr_image: QR_PATH,
          vipps_number: QR_NUMBER,
          vipps_link: QR_LINK,
        })
        .eq("id", 1);
      await page.goto(url);
      await expect(page.getByTestId("order-payment")).toBeVisible();
      await shoot(page, url, "with-settings");

      // QR alone is a legitimate state (Alessio may not have given the number)
      await db
        .from("settings")
        .update({ vipps_number: null })
        .eq("id", 1);
      await page.goto(url);
      await expect(page.getByTestId("order-vipps-number")).toHaveCount(0);
      await expect(page.getByTestId("order-vipps-qr")).toBeVisible();
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(url);
      await page.getByTestId("order-confirmation").waitFor({ state: "visible" });
      await page.screenshot({ path: `${OUT}/takk-qr-only-no-390.png`, fullPage: true });
    }
  } finally {
    if (before) await adminClient().from("settings").update(before).eq("id", 1);
    await adminClient().storage.from("assets").remove([QR_PATH]);
    await deleteOrder(orderId);
  }
});
