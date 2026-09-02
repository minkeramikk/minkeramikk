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

/** Step 3 monta `cartPanel` due volte (sezione mobile + rail desktop): senza
 *  `:visible` il locator è ambiguo e Playwright va in strict mode. */
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
        // Sotto md la caption di `next-step` NON è una caption: è l'etichetta
        // visibile del mockup .navB, 15px semibold, e il call-site la
        // sovrascrive apposta sopra i 10px della ricetta `sm`. Quella
        // precedenza regge sull'ordine delle classi in `className` e sulla
        // semantica di tailwind-merge: due cose che un riordino futuro può
        // rompere senza che si veda a occhio. Si misura il CALCOLATO, non le
        // classi — le classi possono essere tutte presenti e perdere lo
        // stesso.
        measures[k("nextCaptionPx")] = await vis(page, "next-step")
          .locator("[data-pill-caption]")
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
      await vis(page, "docked-checkout").scrollIntoViewIfNeeded();
      const c = await boxOf(page, "docked-checkout");
      const n = await boxOf(page, "new-design-cta");
      const s = await boxOf(page, "share-set");
      measures[k("checkout")] = Math.round(c.height);
      measures[k("newDesign")] = Math.round(n.height);
      measures[k("share")] = Math.round(s.height);
      // Lo "stack" della card = dal bordo alto del primario al bordo basso
      // dell'ultima pillola, gap compresi (237px = 72+12+71+12+70).
      measures[k("stack")] = Math.round(s.y + s.height - c.y);
      measures[k("gapPrimary")] = Math.round(n.y - (c.y + c.height));
      measures[k("gapLow")] = Math.round(s.y - (n.y + n.height));
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

      // ── sentinelli AC7: barra sticky (solo mobile) e drawer ─────────────
      if (w < 768) {
        // La barra si nasconde quando il blocco ordine è a schermo: il punto
        // di osservazione va fissato in cima, dove la barra serve davvero.
        await page.evaluate(() => window.scrollTo(0, 0));
        measures[k("sticky")] = await heightOf(page, "sticky-bar-checkout");
      }
      await page.getByTestId("cart-button").click();
      await page.getByTestId("cart-drawer").waitFor();
      measures[k("cartCheckout")] = await heightOf(page, "cart-checkout");
      persist(measures);

      // ── AC3: il touch target è il <button>, non il disco ────────────────
      const smPills = w < 768
        ? ["new-design-cta", "share-set", "back-step", "next-step"]
        : ["new-design-cta", "share-set"];
      for (const id of smPills) {
        const key = { "new-design-cta": "newDesign", "share-set": "share",
          "back-step": "back", "next-step": "next" }[id]!;
        expect(
          measures[k(key)],
          `AC3: ${id} @${w} ${locale} sotto i 44px di touch target`
        ).toBeGreaterThanOrEqual(44);
      }

      // ── AC4: ingombro e gerarchia dello stack ──────────────────────────
      expect(
        measures[k("stack")],
        `AC4: stack @${w} ${locale} oltre 195px`
      ).toBeLessThanOrEqual(195);
      expect(
        measures[k("checkout")] /
          Math.max(measures[k("newDesign")], measures[k("share")]),
        `AC4: il primario @${w} ${locale} non domina (rapporto < 1,4)`
      ).toBeGreaterThanOrEqual(1.4);

      // ── AC5: la riga nav sotto md ──────────────────────────────────────
      if (w < 768) {
        expect(
          measures[k("nav")],
          `AC5: step-nav-flow @${w} ${locale} oltre 72px`
        ).toBeLessThanOrEqual(72);
        // Vale in ENTRAMBE le fasi: oggi la caption è già 15px e deve
        // restarci. Un rosso qui nel giro `after` significa che la ricetta
        // `sm` ha scavalcato l'override del call-site — cioè che l'ordine in
        // `className` è stato invertito.
        expect(
          measures[k("nextCaptionPx")],
          `mockup .navB: la caption di next-step @${w} ${locale} deve restare 15px`
        ).toBe(15);
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

      await page.goto(`/${locale}/configurator?design=${design}&step=3`);
      await page.getByTestId("ceramics-step").waitFor();
      await addFirstCeramic(page);
      for (const id of ["docked-checkout", "new-design-cta", "share-set"]) {
        expect(
          await clipped(page, id),
          `AC8: ${id} @${w} ${locale} è troncata`
        ).toBe(false);
      }
    });
  }
}
