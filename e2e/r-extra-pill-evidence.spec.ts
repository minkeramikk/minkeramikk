import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { addFirstCeramic } from "./helpers";

/**
 * R-EXTRA — evidenza visiva delle CTA a pillola sui 3 step, 390/768/1280, NO+EN.
 * Non è un test di regressione (quelli stanno in configurator.spec.ts): serve a
 * produrre gli screenshot che la card chiede in PR, e a chiudere le 3 cose che
 * la review finale ha detto di guardare — contrasto della caption, anello di
 * focus, troncamento dell'etichetta a 390.
 *
 * Gli assert ci sono lo stesso: uno screenshot che nessuno guarda non prova
 * niente, mentre "l'etichetta non è troncata" è una misura, non un'opinione.
 */
const OUT = "docs/evidence/r-extra-cta-pillola";
const SIZES = [
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1280, h: 900 },
] as const;

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const locale of ["no", "en"] as const) {
  for (const { w, h } of SIZES) {
    test(`pills @${w} ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });

      // ── step 1 ─────────────────────────────────────────────────────────
      await page.goto(`/${locale}/configurator`);
      await page.getByTestId("design-context-block").waitFor();
      const pill1 = page.getByTestId("next-step-mobile");
      await expect(pill1).toBeVisible();
      await page.screenshot({
        path: `${OUT}/01-step1-${locale}-${w}.png`,
        fullPage: true,
      });

      // AC5: il touch target regge a ogni larghezza
      expect((await pill1.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      // AC6 / finding I4: l'etichetta NON deve essere troncata. scrollWidth >
      // clientWidth è esattamente ciò che fa scattare `truncate`.
      const label1 = pill1.locator("span.truncate");
      const clipped1 = await label1.evaluate(
        (el) => el.scrollWidth > el.clientWidth
      );
      expect(
        clipped1,
        `step 1 @${w} ${locale}: l'etichetta è troncata`
      ).toBe(false);

      // finding I3: l'anello di focus deve essere visibile e NON dello stesso
      // colore del bordo della pillola.
      await pill1.focus();
      const ring = await pill1.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: s.outlineColor, border: s.borderColor };
      });
      expect(ring.outline).not.toBe(ring.border);
      await page.screenshot({
        path: `${OUT}/02-step1-focus-${locale}-${w}.png`,
        fullPage: true,
      });

      // ── step 2 ─────────────────────────────────────────────────────────
      await pill1.click();
      await expect(page).toHaveURL(/[?&]step=2/);
      const back = page.getByTestId("back-step");
      const pill2 = page.getByTestId("next-step");
      await expect(back).toBeVisible();
      await expect(pill2).toBeVisible();

      // AC2 + R-EXTRA (mockup-mobile-stacked-COMPARE.jpg): affiancati stessa
      // altezza (richiesta cliente); impilati l'ordine si INVERTE — il Next
      // sta sopra, il Back sotto, entrambi a piena larghezza.
      const [bb, nb] = [
        (await back.boundingBox())!,
        (await pill2.boundingBox())!,
      ];
      if (Math.abs(bb.y - nb.y) < 1) {
        expect(
          Math.abs(bb.height - nb.height),
          `step 2 @${w}: affiancati ma di altezza diversa`
        ).toBeLessThanOrEqual(1);
      } else {
        expect(nb.y, `step 2 @${w}: il Back non sta SOTTO il Next`).toBeLessThan(bb.y);
        expect(
          Math.abs(bb.width - nb.width),
          `step 2 @${w}: impilati ma non a piena larghezza`
        ).toBeLessThanOrEqual(1);
      }

      const clipped2 = await pill2
        .locator("span.truncate")
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(
        clipped2,
        `step 2 @${w} ${locale}: l'etichetta è troncata`
      ).toBe(false);

      await page.screenshot({
        path: `${OUT}/03-step2-${locale}-${w}.png`,
        fullPage: true,
      });

      // ── step 3 ─────────────────────────────────────────────────────────
      await pill2.click();
      await expect(page).toHaveURL(/[?&]step=3/);
      await page.getByTestId("ceramics-step").waitFor();

      // Lo stack delle 3 pillole esiste solo a carrello NON vuoto: senza una
      // riga dentro, lo screenshot proverebbe il contrario di ciò che serve.
      // R4-STEP3: apre lo sheet della prima card e aggiunge da lì (add-to-cart
      // non esiste finché nulla è aperto).
      await addFirstCeramic(page);
      const checkout = page.locator('[data-testid="docked-checkout"]:visible').first();
      await expect(checkout).toBeVisible();

      // AC3: la freccetta marca ciò che FA AVANZARE il funnel, non "un solo
      // bottone". Le altre due pillole dello stack non avanzano — una riavvia
      // il flusso, l'altra è collaterale — quindi restano senza.
      for (const id of ["new-design-cta", "share-set"]) {
        const other = page.locator(`[data-testid="${id}"]:visible`).first();
        await expect(other).toBeVisible();
        expect(
          await other.evaluate((el) => el.textContent?.includes("›") ?? false),
          `${id} non deve avere la freccetta di avanzamento`
        ).toBe(false);
      }
      expect(
        await checkout.evaluate((el) => el.textContent?.includes("›") ?? false)
      ).toBe(true);

      // R4-CTA-STICKY (card `docs/revision4/R4-CTA-STICKY.md`): su mobile i
      // "Bestill" con freccetta sono DUE e sono entrambi legittimi — la barra
      // ordine fissa in basso e la CTA del pannello carrello. Portano allo
      // stesso posto, quindi la gerarchia regge: l'invariante non è "una sola
      // freccetta" ma "la freccetta solo dove si avanza". Sotto md la barra non
      // esiste e il conto torna a uno.
      const stickyPill = page.locator('[data-testid="sticky-bar-checkout"]:visible');
      if (w < 768) {
        // Giro garanzia: la barra si nasconde quando il blocco ordine è a
        // schermo, quindi il punto di osservazione va fissato — in cima, dove
        // il blocco ordine sta sotto la piega ed è esattamente lì che la barra
        // serve.
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(stickyPill).toHaveCount(1);
        expect(
          await stickyPill.evaluate((el) => el.textContent?.includes("›") ?? false),
          "la pillola della barra ordine deve avere la freccetta: fa avanzare il funnel"
        ).toBe(true);
      } else {
        await expect(stickyPill).toHaveCount(0);
      }

      await page.screenshot({
        path: `${OUT}/04-step3-${locale}-${w}.png`,
        fullPage: true,
      });

      // R4-CTA-STICKY, giro garanzia (ruling designer 26/8). Il tap sulla barra
      // non "scrolla verso il carrello": APRE il form ordine e ci atterra
      // dentro col campo nome già a fuoco (il tap è user gesture → tastiera
      // aperta al primo tocco), e la barra sparisce perché ora il blocco ordine
      // è a schermo — mai due «Bestill» insieme.
      if (w < 768) {
        await stickyPill.click();
        // `cartPanel` è renderizzato due volte (sezione mobile + rail
        // desktop nascosto): il locator va scoped, altrimenti strict mode.
        await expect(
          page.getByTestId("mobile-cart-section").getByTestId("order-name")
        ).toBeFocused();
        await expect(
          page.locator('[data-testid="step3-sticky-bar"]'),
          "la barra deve sparire quando il blocco ordine è in viewport"
        ).toHaveCount(0);
      }
    });
  }
}
