import { test, expect, type Page } from "@playwright/test";
import {
  addFirstCeramic,
  adminClient,
  fillOrderForm,
  firstActiveDesign,
  HAS_SERVICE,
} from "./helpers";

/**
 * Invio email REALE — opt-in. Gira SOLO via `make test-email`
 * (MK_E2E_REAL_EMAIL=1, project "email"); la suite core non lo esegue mai, così
 * non parte alcuna email durante i run normali.
 *
 * Manda un solo ordine; cliente e notifica vanno alla casella dedicata
 * (E2E_EMAIL_TO, default dangeli88.daniele@gmail.com). Non possiamo
 * leggere la inbox da qui: il test verifica che il submit vada a buon fine con
 * RESEND attivo (createOrder invia e non lancia) → la consegna si controlla a
 * mano nella casella. Vincolo Resend: col sender di test, l'alias `+` potrebbe
 * essere rifiutato → verificare il dominio o usare l'email dell'account.
 */

const REAL = process.env.MK_E2E_REAL_EMAIL === "1";
const TO = process.env.E2E_EMAIL_TO || "dangeli88.daniele@gmail.com";
const createdCodes: string[] = [];

test.skip(!REAL, "opt-in: esegui con `make test-email`");

test.afterAll(async () => {
  if (!HAS_SERVICE) return;
  const db = adminClient();
  for (const code of createdCodes) await db.from("orders").delete().eq("code", code);
});

async function toCheckout(page: Page) {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=3`);
  await addFirstCeramic(page);
  await page.getByTestId("cart-button").click();
  await page.getByTestId("cart-checkout").click();
  await page.getByTestId("order-form").waitFor();
}

test("invio reale: un ordine genera la conferma e invia alla casella dedicata", async ({
  page,
}) => {
  await toCheckout(page);
  // cliente = casella dedicata
  await fillOrderForm(page, "E2E Email Test", TO);
  await page.getByTestId("order-submit").click();

  // submit andato a buon fine con RESEND attivo → l'invio è partito server-side
  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  const code = await page.getByTestId("order-code").innerText();
  createdCodes.push(code);
  expect(code).toMatch(/^MK-\d+$/);

  // R4-MAIL-JOURNEY §E: the sends now run in `after()`, i.e. AFTER this POST
  // returned. Without an explicit wait, afterAll would delete the order (and
  // the run could end) while the server is still rendering the mails — the old
  // "submit returned, therefore it was sent" assumption is now a race. There is
  // nothing observable to poll from here (no inbox access), so this is a plain
  // wait, deliberately generous: this spec is opt-in and runs once.
  await page.waitForTimeout(5000);

  console.log(`[order-email] ordine ${code} inviato a ${TO} — controlla la inbox.`);
});
