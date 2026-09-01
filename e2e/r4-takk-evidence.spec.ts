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
 * R4-TAKK evidence (tooling, NOT a gate) — the thank-you page in the three
 * states the card is judged on. NO and EN, 390 / 768 / 1280.
 *
 * ONE state per run, chosen by MK_TAKK_STATE, and the settings row is written
 * BEFORE the first page load. That is not fussiness: `getVippsSettings()` is an
 * `unstable_cache` with `revalidate: 300`, so a state flipped mid-run is simply
 * not observed — an earlier version of this spec toggled the row between shots
 * and produced twelve byte-identical screenshots that all showed the same
 * state. Each run boots its own server (Playwright's webServer), so each run
 * starts with a cold cache that reads the state this run just wrote.
 *
 * The assertions below are the guard against that happening again: a run that
 * cannot see the state it just wrote FAILS instead of quietly shooting the
 * wrong page.
 *
 *   MK_TAKK_STATE=empty   → nothing configured; the payment block must vanish
 *   MK_TAKK_STATE=qr-only → QR but no number (Alessio has not given one yet)
 *   MK_TAKK_STATE=full    → QR + number (default)
 *
 * Run all three (a fresh server per run is what makes it work):
 *   for s in empty qr-only full; do \
 *     MK_TAKK_STATE=$s npx playwright test e2e/r4-takk-evidence.spec.ts \
 *       --project=evidence; done
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
/** Placeholder: Alessio has not given the real Vippsnummer yet. */
const QR_NUMBER = "654321";

type VippsRow = {
  vipps_qr_image: string | null;
  vipps_number: string | null;
  vipps_link: string | null;
};

const STATE = (process.env.MK_TAKK_STATE ?? "full") as
  | "empty"
  | "qr-only"
  | "full";

const ROWS: Record<typeof STATE, VippsRow> = {
  empty: { vipps_qr_image: null, vipps_number: null, vipps_link: null },
  "qr-only": { vipps_qr_image: QR_PATH, vipps_number: null, vipps_link: QR_LINK },
  full: { vipps_qr_image: QR_PATH, vipps_number: QR_NUMBER, vipps_link: QR_LINK },
};

async function shoot(page: Page, url: string) {
  for (const locale of LOCALES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url.replace("/no/", `/${locale}/`));
      await page.getByTestId("order-confirmation").waitFor({ state: "visible" });
      await page.waitForTimeout(250); // let the mini-plate layers settle
      await page.screenshot({
        path: `${OUT}/takk-${STATE}-${locale}-${width}.png`,
        fullPage: true,
      });
    }
  }
}

test(`R4-TAKK: thank-you page — settings "${STATE}", NO/EN, 390/768/1280`, async ({
  page,
}) => {
  test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");
  test.setTimeout(180_000);

  const db = adminClient();
  let orderId = "";
  let before: VippsRow | null = null;

  try {
    // ── state FIRST, before anything renders (see the note on the cache) ─────
    const { data, error } = await db
      .from("settings")
      .select("vipps_qr_image, vipps_number, vipps_link")
      .eq("id", 1)
      .single();
    expect(error, "migration 0035 is not applied to this database").toBeNull();
    before = data as VippsRow;

    if (STATE !== "empty") {
      expect(existsSync(QR_SRC), `missing ${QR_SRC}`).toBe(true);
      const up = await db.storage
        .from("assets")
        .upload(QR_PATH, readFileSync(QR_SRC), {
          contentType: "image/png",
          upsert: true,
        });
      expect(up.error, up.error?.message).toBeNull();
    }
    const wrote = await db.from("settings").update(ROWS[STATE]).eq("id", 1);
    expect(wrote.error, wrote.error?.message).toBeNull();

    // ── a real order, so the URL under the shots is a real one ───────────────
    const design = await firstActiveDesign();
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

    // ── the page must actually BE in the state we wrote, or the shots lie ────
    const payment = page.getByTestId("order-payment");
    if (STATE === "empty") {
      await expect(payment).toHaveCount(0);
    } else {
      await expect(payment).toBeVisible();
      await expect(page.getByTestId("order-vipps-qr")).toBeVisible();
      await expect(page.getByTestId("order-vipps-melding")).toBeVisible();
      await expect(page.getByTestId("order-vipps-number")).toHaveCount(
        STATE === "full" ? 1 : 0
      );
    }

    await shoot(page, url);
  } finally {
    if (before) await adminClient().from("settings").update(before).eq("id", 1);
    if (STATE !== "empty") {
      await adminClient().storage.from("assets").remove([QR_PATH]);
    }
    await deleteOrder(orderId);
  }
});
