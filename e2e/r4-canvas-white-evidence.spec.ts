import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { activeDesignSlugs, addFirstCeramic } from "./helpers";

/**
 * R4-CANVAS-WHITE — evidenza (tooling, NON un gate).
 *
 * Gira contro `npm run dev` sulla 3199 (ricalibrazione 2/9: evidenza puntuale
 * contro dev, non contro `make build`):
 *   npm run dev -- -p 3199
 *   npx playwright test e2e/r4-canvas-white-evidence.spec.ts --project=evidence
 *
 * Produce tre cose e nient'altro:
 *  a) per 3 design, lo SCATTO DEL SOLO FRAME a 390 e 1280 + il config code che
 *     lo identifica. Il lato "PDF" dell'affiancamento lo compone
 *     `docs/evidence/r4-canvas-white/compose.ts` con `composePlate` — la stessa
 *     funzione che stampa il PDF del ceramista — e poi cuce le due metà.
 *  b) AC5: sul design campione, il conteggio dei pixel ESATTAMENTE uguali
 *     all'hex dello swatch scelto. Su fondo caldo i layer `multiply` spostano
 *     ogni pixel: quel conteggio è 0. Su `--mk-canvas` multiply è l'identità,
 *     quindi > 0 significa Δ 0 misurato, non stimato.
 *  c) AC10: diametro del piatto a 390 e posizione della barra tab sticky, in
 *     due fasi (l'unico AC con un "before"):
 *       MK_EVIDENCE_PHASE=before npx playwright test … --project=evidence
 *     sul commit precedente, poi il giro `after` che li confronta.
 */
const PHASE = process.env.MK_EVIDENCE_PHASE ?? "after";
const ROOT = "docs/evidence/r4-canvas-white";
const OUT = `${ROOT}/${PHASE}`;
const BEFORE = `${ROOT}/before/measures.json`;
mkdirSync(OUT, { recursive: true });

/** AC6: lo swatch più chiaro del catalogo — il caso peggiore di leggibilità. */
const LIGHT_SWATCH = { name: "Giallo Limone", hex: "#f3e39a" };
const WIDTHS = [390, 1280] as const;

const FILE = `${OUT}/measures.json`;
type Measures = Record<string, number | string>;
function persist(part: Measures) {
  const onDisk: Measures = existsSync(FILE)
    ? JSON.parse(readFileSync(FILE, "utf8"))
    : {};
  writeFileSync(FILE, `${JSON.stringify({ ...onDisk, ...part }, null, 2)}\n`);
}

let designs: string[] = [];
test.beforeAll(async () => {
  designs = (await activeDesignSlugs()).slice(0, 3);
});

const frame = (page: Page) => page.locator("[data-canvas-frame]").first();

/** Il piatto NON è il frame: è lo stack dei layer, `h-[84%] w-[84%]` dentro di
 *  esso e `object-contain`, quindi il suo lato corto È il diametro reso. Si
 *  legge dal DOM (il genitore del primo layer), così non serve un hook nuovo
 *  in `preview-canvas.tsx` per misurarlo. */
async function plateDiameter(page: Page) {
  const box = await frame(page)
    .locator("img")
    .first()
    .evaluate((el) => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
  return Math.round(Math.min(box.w, box.h));
}

/** Porta un design in carrello e restituisce il suo config code: è la chiave
 *  con cui il compositore server ricostruisce ESATTAMENTE gli stessi layer. */
async function configCode(page: Page, slug: string) {
  // Carrello azzerato fra un design e l'altro: pieno, lo step 3 rimette a posto
  // la URL da solo (`goto` in ERR_ABORTED) e la modale di upsell post-add
  // resta davanti alla card successiva.
  await page.goto("/no/configurator");
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/no/configurator?design=${slug}&step=3`);
  await addFirstCeramic(page);
  // `.last()`: il carrello si accumula fra un design e l'altro, la prima riga
  // resterebbe sempre quella del primo design.
  const line = page
    .getByTestId("docked-cart-panel")
    .getByTestId("cart-line")
    .last();
  await line.getByTestId("cart-expand").click();
  return (await line.locator("code").first().innerText()).trim();
}

// ── a) i 3 affiancamenti (solo DOPO) ──────────────────────────────────────
test("AC9: frame dei 3 design a 390 e 1280 + config code", async ({ page }) => {
  test.skip(PHASE !== "after", "l'affiancamento è solo il DOPO");
  const codes: Measures = {};
  const layers: Record<string, { src: string; blend: "multiply" | "normal" }[]> = {};
  for (const slug of designs) {
    await page.setViewportSize({ width: 1280, height: 900 });
    codes[`code.${slug}`] = await configCode(page, slug);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
      await page.goto(`/no/configurator?design=${slug}&step=2`);
      await frame(page).locator("img").first().waitFor();
      // le webp dei layer possono arrivare dopo il primo paint: senza questo
      // lo scatto coglie un piatto a metà e il campionamento legge bianco.
      await page.waitForLoadState("networkidle");
      await frame(page).screenshot({ path: `${OUT}/screen-${slug}-${w}.png` });
    }
    // I layer ESATTI che il browser ha appena dipinto (src + blend calcolato):
    // il compositore server li ripassa a `composePlate` così com'è, quindi
    // l'affiancamento confronta la stessa ricetta, non due ricette simili.
    layers[slug] = await frame(page)
      .locator("img")
      .evaluateAll((els) =>
        els.map((el) => ({
          src: (el as HTMLImageElement).src,
          blend: getComputedStyle(el).mixBlendMode === "multiply"
            ? ("multiply" as const)
            : ("normal" as const),
        }))
      );
  }
  persist(codes);
  writeFileSync(`${OUT}/layers.json`, `${JSON.stringify(layers, null, 2)}\n`);
});

// ── b) AC5 + AC6: il colore a schermo È l'hex dello swatch ────────────────
test("AC5+AC6: lo swatch chiaro #f3e39a esce a schermo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const found: string[] = [];
  for (const slug of designs) {
    await page.goto(`/no/configurator?design=${slug}&step=2`);
    await frame(page).locator("img").first().waitFor();
    const sw = page.getByRole("radio", { name: LIGHT_SWATCH.name, exact: true });
    if ((await sw.count()) === 0) continue;
    await sw.first().click();
    await page.waitForLoadState("networkidle");
    await frame(page).screenshot({ path: `${OUT}/light-swatch-${slug}-390.png` });
    await page.screenshot({ path: `${OUT}/light-swatch-${slug}-390-full.png` });
    // i layer dipinti CON lo swatch chiaro selezionato: il compositore li usa
    // come sorgente di verità del campionamento (l'hex del DB è l'intenzione,
    // il webp del layer è ciò che esiste davvero — gli asset sono fuori scope).
    writeFileSync(
      `${OUT}/light-swatch-layers.json`,
      `${JSON.stringify(
        await frame(page)
          .locator("img")
          .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src)),
        null,
        2
      )}\n`
    );
    found.push(slug);
    break;
  }
  expect(found.length, `nessun design espone lo swatch ${LIGHT_SWATCH.name}`).toBe(1);
  persist({ lightSwatchDesign: found[0], lightSwatchHex: LIGHT_SWATCH.hex });
});

// ── c) AC10: i pixel di BTN-SCALE arrivano al piatto ──────────────────────
test("AC10: diametro del piatto e aggancio della barra tab @390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/no/configurator?design=${designs[0]}&step=2`);
  await frame(page).locator("img").first().waitFor();

  // La barra tab è `sticky top-[calc(3.5rem+var(--mk-canvas-h))]`: segue il
  // canvas per COSTRUZIONE. Su questo design a 390 la pagina scorre 245px e la
  // barra non arriva mai alla soglia, quindi "è attaccata" non si misura da una
  // boundingBox — si misura sul `top` CALCOLATO contro il bordo basso del
  // canvas incollato. Se AC10 avesse toccato l'altezza in un solo punto dei
  // due, questi due numeri divergerebbero.
  const canvas = await page.locator("[data-preview-column]").first().boundingBox();
  if (!canvas) throw new Error("canvas non visibile");
  const tabsStickyTop = await page
    .locator("[data-tabs-bar]")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).top));

  const m: Measures = {
    plate390: await plateDiameter(page),
    canvasH390: Math.round(canvas.height),
    // il canvas è `sticky top-14` sotto l'header ink: da scrollati il suo bordo
    // basso sta a 56 + altezza.
    canvasBottomStuck390: 56 + Math.round(canvas.height),
    tabsStickyTop390: Math.round(tabsStickyTop),
  };
  persist(m);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/ac10-step2-390.png` });

  expect(
    Math.abs(Number(m.tabsStickyTop390) - Number(m.canvasBottomStuck390)),
    "la barra tab non segue più il bordo basso del canvas"
  ).toBeLessThanOrEqual(1);

  if (PHASE === "after") {
    expect(
      existsSync(BEFORE),
      "manca il giro di partenza: MK_EVIDENCE_PHASE=before npx playwright " +
        "test e2e/r4-canvas-white-evidence.spec.ts --project=evidence"
    ).toBe(true);
    const before = JSON.parse(readFileSync(BEFORE, "utf8")) as Measures;
    expect(
      Number(m.plate390) - Number(before.plate390),
      `AC10: il piatto @390 non è cresciuto (${before.plate390} → ${m.plate390})`
    ).toBeGreaterThanOrEqual(15);
  }
});
