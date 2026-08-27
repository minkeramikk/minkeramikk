import { expect, test } from "@playwright/test";
import { firstActiveDesign } from "./helpers";

/**
 * R4-FIX — l'editor mobile dello step 2 su un telefono CORTO (390×660: un
 * iPhone con le barre di Chrome aperte, che è il caso in cui i difetti sono
 * usciti). Non è un journey nuovo: protegge le tre invarianti geometriche che
 * il test su iPhone reale ha smentito, e che nessun unit può vedere.
 *
 * Gira nel progetto `editor` (viewport 390×660), non nei progetti desktop/mobile.
 */

const EDITOR_VIEWPORT = { width: 390, height: 660 };

test.use({ viewport: EDITOR_VIEWPORT });

test("B1: nello step 2 mobile il pannello non scorre in verticale — scorre solo il pane «Detaljer»", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  const panel = page.getByTestId("details-step");
  await expect(panel).toBeVisible();

  // il pannello è una colonna rigida: nessuna corsa verticale da rubare allo
  // swipe orizzontale delle corsie
  const panelScroll = await panel.evaluate(
    (el) => el.scrollHeight - el.clientHeight
  );
  expect(panelScroll, "il pannello non deve avere scroll verticale").toBeLessThanOrEqual(0);

  // e non deborda mai in larghezza (con `html{overflow:hidden}` un pannello
  // troppo largo non si vedrebbe: va misurato, non guardato)
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.width)).toBeLessThanOrEqual(EDITOR_VIEWPORT.width);

  // la pagina stessa non scorre
  const pageOverflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(pageOverflowX).toBeLessThanOrEqual(0);

  // il pane «Detaljer» è l'unico che può scorrere: quando è attivo, il pannello
  // resta comunque rigido
  await page.getByTestId("category-tab-extras").click();
  await expect(page.getByTestId("step2-extras")).toBeVisible();
  const stillRigid = await panel.evaluate(
    (el) => el.scrollHeight - el.clientHeight
  );
  expect(stillRigid, "aprire «Detaljer» non deve rendere scrollabile il pannello").toBeLessThanOrEqual(0);
});

test("B2: la corsia densa (>9 opzioni) entra per intero — due righe, etichette complete", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await expect(page.getByTestId("details-step")).toBeVisible();

  // scelgo il gruppo denso dal conteggio scritto nella tab: «Nome (N)», N > 9
  const tabs = page.getByTestId("category-tabs").locator("button");
  const labels = await tabs.allTextContents();
  const denseIndex = labels.findIndex((l) => {
    const n = Number(l.match(/\((\d+)\)\s*$/)?.[1] ?? 0);
    return n > 9;
  });
  test.skip(
    denseIndex < 0,
    `nessun gruppo con più di 9 opzioni sul design "${design.slug}": corsia densa non verificabile qui`
  );
  await tabs.nth(denseIndex).click();

  const lane = page.getByTestId("option-grid").filter({ visible: true }).first();
  await expect(lane).toBeVisible();

  const geometry = await lane.evaluate((el) => {
    const laneRect = el.getBoundingClientRect();
    const cells = [...el.children].map((c) => c.getBoundingClientRect());
    const rows = new Set(cells.map((c) => Math.round(c.top)));
    return {
      verticalScroll: el.scrollHeight - el.clientHeight,
      rows: rows.size,
      clipped: cells.filter(
        (c) => c.top < laneRect.top - 1 || c.bottom > laneRect.bottom + 1
      ).length,
    };
  });

  expect(geometry.rows, "la corsia densa sta su due righe").toBe(2);
  expect(geometry.clipped, "nessuna cella tagliata sopra o sotto").toBe(0);
  expect(
    geometry.verticalScroll,
    "la corsia scorre in orizzontale, mai in verticale"
  ).toBeLessThanOrEqual(0);

  // l'etichetta numerata di ogni opzione è renderizzata (non alta zero, non
  // sovrapposta allo swatch della riga sotto)
  const firstCell = lane.locator("> *").first();
  const labelBox = await firstCell.locator("span").last().boundingBox();
  expect(labelBox!.height).toBeGreaterThan(0);
  const swatchBox = await firstCell.getByRole("radio").boundingBox();
  expect(
    labelBox!.y,
    "l'etichetta sta SOTTO il suo swatch, non sopra"
  ).toBeGreaterThanOrEqual(swatchBox!.y + swatchBox!.height - 1);
});

test("R4-FIX 8: il campo «Tekst» compare solo scegliendo un'opzione di testo", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await expect(page.getByTestId("details-step")).toBeVisible();

  // il gruppo che governa la scritta si riconosce dal nome (stessa euristica del
  // codice, vedi lib/configurator/text-option.ts)
  const tabs = page.getByTestId("category-tabs").locator("button");
  const labels = await tabs.allTextContents();
  const textIndex = labels.findIndex((l) =>
    /^(tekst|text)\b/i.test(l.trim())
  );
  // Skip DICHIARATO (lezione F07: mai skip silenziosi): finché il cliente non
  // crea il gruppo «Tekst» in back-office questo caso non esiste in catalogo, e
  // l'euristica resta coperta dagli unit di text-option.test.ts.
  if (textIndex < 0) {
    const msg = `nessun gruppo «Tekst» sul design "${design.slug}" — campo scritta non verificabile in e2e (coperto dagli unit)`;
    console.warn(msg);
    test.info().annotations.push({ type: "warning", description: msg });
    test.skip(true, msg);
  }

  await tabs.nth(textIndex).click();
  // prima opzione = «nessun testo»: niente campo
  const options = page
    .getByTestId("option-grid")
    .filter({ visible: true })
    .first()
    .locator("> *");
  await options.first().click();
  await expect(page.getByTestId("custom-text")).toHaveCount(0);

  // qualunque altra opzione lo fa comparire, dentro il tab del gruppo
  await options.nth(1).click();
  await expect(page.getByTestId("custom-text")).toBeVisible();
  await expect(page.getByTestId("custom-text-input")).toBeVisible();
});
