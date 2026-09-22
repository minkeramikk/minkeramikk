import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { addFirstCeramic, firstActiveDesign } from "./helpers";

/**
 * R4-BTN-SCALE — evidenza (tooling, NON un gate): matrice 390/768/1280 × no/en
 * su step 2 e step 3, più il rail desktop, con le altezze misurate.
 *
 * Due giri della STESSA spec:
 *   MK_EVIDENCE_PHASE=before npx playwright test e2e/r4-btn-scale-evidence.spec.ts --project=evidence
 *   npx playwright test e2e/r4-btn-scale-evidence.spec.ts --project=evidence
 *
 * Il primo gira PRIMA di toccare le pillole: scrive i numeri di partenza e
 * FALLISCE sugli AC numerici (91px di riga nav e ~237px di stack non stanno
 * sotto 72 e 195). Quel rosso È il "prima" da mettere in PR. Il secondo gira a
 * lavoro finito e deve essere verde.
 *
 * Il giro `after` rilegge i numeri del giro `before` e li confronta sui
 * SENTINELLI: la CTA dello step 1, la barra sticky, la pillola del drawer
 * (AC7) e la riga nav sopra md (AC6). Così "non abbiamo toccato le altre tre
 * superfici" è una misura, non una promessa.
 */
const PHASE = process.env.MK_EVIDENCE_PHASE ?? "after";
const ROOT = "docs/evidence/r4-btn-scale";
const OUT = `${ROOT}/${PHASE}`;
const BEFORE = `${ROOT}/before/measures.json`;
mkdirSync(OUT, { recursive: true });

/** Matrice degli screenshot chiesta dalla card. */
const SHOTS = [390, 768, 1280] as const;
/** AC8: le larghezze in cui l'etichetta rischia il troncamento. */
const LABEL_WIDTHS = [360, 390, 412] as const;
const LOCALES = ["no", "en"] as const;

type Measures = Record<string, number>;
const measures: Measures = {};

let design = "";
test.beforeAll(async () => {
  design = (await firstActiveDesign()).slug;
});

const FILE = `${OUT}/measures.json`;
/**
 * Le misure si scrivono a fine di OGNI test, unite a quelle già su disco:
 * Playwright riavvia il worker dopo un test fallito e l'accumulatore in memoria
 * riparte vuoto. Nel giro `before` — rosso di proposito — un `afterAll` da solo
 * scriverebbe solo l'ultimo frammento, e il file andrebbe ricucito a mano.
 */
function persist(part: Measures) {
  const onDisk: Measures = existsSync(FILE)
    ? JSON.parse(readFileSync(FILE, "utf8"))
    : {};
  writeFileSync(FILE, `${JSON.stringify({ ...onDisk, ...part }, null, 2)}\n`);
}

/** Più di un contenitore può portare lo stesso testid (la colonna dello step
 *  3 e il drawer): senza `:visible` il locator è ambiguo e Playwright va in
 *  strict mode. */
const vis = (page: Page, id: string) =>
  page.locator(`[data-testid="${id}"]:visible`).first();

async function boxOf(page: Page, id: string) {
  const b = await vis(page, id).boundingBox();
  if (!b) throw new Error(`${id}: nessun box, non è visibile`);
  return b;
}
const heightOf = async (page: Page, id: string) =>
  Math.round((await boxOf(page, id)).height);

/**
 * AC8: `scrollWidth > clientWidth` sul testo VISIBILE della pillola. Il nodo
 * `sr-only` dello step 2 (l'etichetta lunga sotto md) è alto 1px e va escluso:
 * è nascosto per definizione, misurarlo darebbe un troncamento che nessuno
 * vede — un falso rosso permanente.
 */
const clipped = (page: Page, id: string) =>
  vis(page, id).evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-pill-label],[data-pill-caption]")]
      .filter((n) => n.clientHeight > 1)
      .some((n) => n.scrollWidth > n.clientWidth)
  );

for (const locale of LOCALES) {
  for (const w of SHOTS) {
    test(`btn-scale @${w} ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 1024 });
      const k = (name: string) => `${locale}.${w}.${name}`;

      // ── step 1: sentinello AC7, non si tocca ────────────────────────────
      await page.goto(`/${locale}/configurator?design=${design}&step=1`);
      await page.getByTestId("design-context-block").waitFor();
      measures[k("step1")] = await heightOf(page, "next-step-mobile");

      // ── step 2: la riga nav (AC5 sotto md, AC6 sopra) ───────────────────
      await page.goto(`/${locale}/configurator?design=${design}&step=2`);
      await page.getByTestId("step-nav-flow").scrollIntoViewIfNeeded();
      measures[k("nav")] = await heightOf(page, "step-nav-flow");
      measures[k("back")] = await heightOf(page, "back-step");
      measures[k("next")] = await heightOf(page, "next-step");
      if (w < 768) {
        // R5-POLISH-STEP23 (TL, 22/9: «il copy deve essere pick your
        // ceramics»): sotto md il visibile è l'ETICHETTA, non più la caption
        // promossa del mockup .navB — la caption («Next step») è `sr-only`.
        // Si misura il CALCOLATO e non le classi, per la stessa ragione di
        // prima: la ricetta `sm` porta l'etichetta a 14px e un riordino di
        // `className` può cambiarla senza che si veda a occhio.
        measures[k("nextLabelPx")] = await vis(page, "next-step")
          .locator("[data-pill-label]")
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      }
      await page.screenshot({
        path: `${OUT}/step2-${locale}-${w}.png`,
        fullPage: true,
      });

      // ── step 3: lo stack (AC4) ─────────────────────────────────────────
      await page.goto(`/${locale}/configurator?design=${design}&step=3`);
      await page.getByTestId("ceramics-step").waitFor();
      // Lo stack esiste solo a carrello NON vuoto: senza una riga dentro, lo
      // screenshot proverebbe il contrario di ciò che serve.
      await addFirstCeramic(page);
      // R5-BASKET-HOST PR 2: le tre pillole stanno nella COLONNA dello step
      // 3, che da questa PR si renderizza solo da `lg`. A 390 le misurava
      // nella copia in flusso (`mobile-cart-section`), che non esiste più, e
      // a 768 nel rail, che lì non c'è più: le misure dello stack diventano
      // desktop, punto. Sotto `lg` restano gli scatti e i sentinelli della
      // barra e del drawer, che sono le superfici che quelle larghezze hanno
      // davvero.
      if (w >= 1024) {
        await vis(page, "docked-checkout").scrollIntoViewIfNeeded();
        const c = await boxOf(page, "docked-checkout");
        measures[k("checkout")] = Math.round(c.height);
        // R5-POLISH-STEP23: new-design-cta e share-set rimossi dallo stack
        // (share solo con `?admin=1`) — resta l'altezza del primario.
      }
      await page.screenshot({
        path: `${OUT}/step3-${locale}-${w}.png`,
        fullPage: true,
      });
      if (w === 1280) {
        // AC4 vale sul rail desktop perché è lo STESSO nodo: uno scatto del
        // solo rail lo mostra senza farlo cercare in una pagina intera.
        await page.getByTestId("docked-cart-panel").screenshot({
          path: `${OUT}/step3-rail-${locale}.png`,
        });
      }

      // ── sentinelli AC7: barra sticky (sotto `lg`) e drawer ──────────────
      // PR 2: la barra ora vive fino a `lg`, non più fino a `md`, e non si
      // nasconde più allo scorrimento (l'IntersectionObserver guardava la
      // sezione in flusso, cancellata col task 6). Il punto di osservazione
      // resta in cima per confrontarsi col giro `before`.
      if (w < 1024) {
        await page.evaluate(() => window.scrollTo(0, 0));
        measures[k("sticky")] = await heightOf(page, "sticky-bar-checkout");
      }
      await page.getByTestId("cart-button").click();
      await page.getByTestId("cart-drawer").waitFor();
      measures[k("cartCheckout")] = await heightOf(page, "cart-checkout");
      persist(measures);

      // ── AC3: il touch target è il <button>, non il disco ────────────────
      // R5-POLISH-STEP23: le due pillole basse non esistono più — resta la
      // riga nav dello step 2, che si misura sotto md.
      const smPills = w < 768 ? ["back-step", "next-step"] : [];
      for (const id of smPills) {
        const key = { "back-step": "back", "next-step": "next" }[id]!;
        expect(
          measures[k(key)],
          `AC3: ${id} @${w} ${locale} sotto i 44px di touch target`
        ).toBeGreaterThanOrEqual(44);
      }

      // ── AC4: R5-POLISH-STEP23 — lo stack è una pillola sola (le due basse
      // sono state rimosse), quindi ingombro e rapporto non hanno più due
      // termini da confrontare: le asserzioni sono cadute con le pillole.

      // ── AC5: la riga nav sotto md ──────────────────────────────────────
      if (w < 768) {
        expect(
          measures[k("nav")],
          `AC5: step-nav-flow @${w} ${locale} oltre 72px`
        ).toBeLessThanOrEqual(72);
        // L'etichetta è ciò che il cliente legge sul bottone: deve esserci e
        // avere la taglia della ricetta `sm` (14px). Un rosso qui significa
        // che qualcuno l'ha rinascosta o le ha cambiato scala sotto md.
        expect(
          measures[k("nextLabelPx")],
          `next-step @${w} ${locale}: l'etichetta visibile deve restare 14px`
        ).toBe(14);
      }

      // ── AC6 + AC7 contro i numeri del giro `before` ────────────────────
      if (PHASE === "after") {
        expect(
          existsSync(BEFORE),
          "manca il giro di partenza: MK_EVIDENCE_PHASE=before npx playwright " +
            "test e2e/r4-btn-scale-evidence.spec.ts --project=evidence"
        ).toBe(true);
        const before = JSON.parse(readFileSync(BEFORE, "utf8")) as Measures;
        const sentinels =
          w < 768 ? ["step1", "sticky", "cartCheckout"] : ["step1", "cartCheckout"];
        for (const name of sentinels) {
          expect(
            Math.abs(measures[k(name)] - before[k(name)]),
            `AC7: ${name} @${w} ${locale} è cambiato (${before[k(name)]} → ${measures[k(name)]}): resta lg`
          ).toBeLessThanOrEqual(1);
        }
        if (w >= 768) {
          expect(
            Math.abs(measures[k("nav")] - before[k("nav")]),
            `AC6: la riga nav @${w} ${locale} è cambiata sopra md (${before[k("nav")]} → ${measures[k("nav")]})`
          ).toBeLessThanOrEqual(1);
        }
      }
    });
  }
}

for (const locale of LOCALES) {
  for (const w of LABEL_WIDTHS) {
    test(`AC8 nessuna etichetta troncata @${w} ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 });

      await page.goto(`/${locale}/configurator?design=${design}&step=2`);
      await page.getByTestId("step-nav-flow").scrollIntoViewIfNeeded();
      for (const id of ["back-step", "next-step"]) {
        expect(
          await clipped(page, id),
          `AC8: ${id} @${w} ${locale} è troncata`
        ).toBe(false);
      }

      // R5-BASKET-HOST PR 2: `docked-checkout` (e, prima di
      // R5-POLISH-STEP23, `new-design-cta` e `share-set`)
      // stanno nella colonna dello step 3, che si renderizza solo da `lg`.
      // Tutte e tre le LABEL_WIDTHS sono sotto — `:visible` non troverebbe
      // niente e i sei test si pianterebbero per 30s. Un `if (w >= 1024)` qui
      // sarebbe una condizione sempre falsa, cioè uno skip silenzioso
      // travestito (lezione F07): il blocco si cancella, e resta scritto qui
      // che l'AC8 su quelle tre pillole non ha più una larghezza stretta in
      // cui vivere. Se la si vuole sul desktop, è un caso nuovo a 1280 — non
      // un ripristino di questo.
    });
  }
}
