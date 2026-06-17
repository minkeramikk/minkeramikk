import { test, expect } from "@playwright/test";
import {
  ADMIN_READY,
  loginAdmin,
  seedOrderWithSupplierEmail,
  deleteOrder,
  deleteSupplier,
} from "./helpers";

/**
 * Invio reale al FORNITORE — opt-in (project "email", `make test-email`).
 * Genera il PDF d'ordine e lo inoltra alla casella di test: l'ordine è seedato
 * con un fornitore USA-E-GETTA la cui email = E2E_EMAIL_TO, così l'invio non
 * raggiunge mai un laboratorio reale. Nessuna modifica al codice di produzione.
 *
 * Vincolo Resend identico all'ordine: col sender di test la consegna è ammessa
 * solo verso l'email dell'account (vedi e2e/README.md).
 */

const REAL = process.env.MK_E2E_REAL_EMAIL === "1";
const TO = process.env.E2E_EMAIL_TO || "dangeli88.daniele+mke2e@gmail.com";

test.skip(!REAL, "opt-in: esegui con `make test-email`");
test.skip(!ADMIN_READY, "needs ADMIN_EMAIL/PASSWORD + service role");

let seeded: Awaited<ReturnType<typeof seedOrderWithSupplierEmail>> | undefined;

test.beforeAll(async () => {
  if (!REAL || !ADMIN_READY) return;
  seeded = await seedOrderWithSupplierEmail(TO);
});

test.afterAll(async () => {
  if (!seeded) return;
  await deleteOrder(seeded.orderId);
  await deleteSupplier(seeded.tempSupplierId);
});

test("invio reale: PDF fornitore generato e inoltrato alla casella di test", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto(`/admin/orders/${seeded!.orderId}`);

  // il PDF è scaricabile (route admin) e le azioni sono presenti
  const dl = await page.request.get(
    `/api/admin/orders/${seeded!.orderId}/pdf?supplier=${seeded!.supplierId}`
  );
  expect(dl.status()).toBe(200);
  expect(dl.headers()["content-type"]).toContain("application/pdf");

  // invio reale al fornitore (email = casella di test) → "Sent to …"
  await expect(page.getByTestId("lab-pdf-actions").first()).toBeVisible();
  await page.getByTestId("lab-pdf-send").first().click();
  const result = page.getByTestId("lab-pdf-result").first();
  await expect(result).toBeVisible();
  await expect(result).toContainText(/sent to/i);

  console.log(`[supplier-email] PDF ordine ${seeded!.code} inviato a ${TO} — controlla la inbox.`);
});
