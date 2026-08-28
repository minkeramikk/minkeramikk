import { expect, test } from "@playwright/test";
import { activeDesignSlugs, firstActiveDesign } from "./helpers";

/**
 * R4-RESTYLE — lo step 2 sotto md su un telefono CORTO (390×660: un iPhone con
 * le barre di Chrome aperte, il caso in cui i difetti sono usciti).
 *
 * Non è un journey nuovo: protegge le invarianti GEOMETRICHE del restyle
 * richiesto dal cliente, quelle che nessun unit può vedere.
 *  - la pagina è UNO scroller verticale e il canvas è sticky: resta a schermo
 *    anche quando il pannello strumenti è in viewport (vincolo non negoziabile);
 *  - il pannello non scorre MAI in verticale (B1: lo swipe orizzontale di una
 *    corsia non deve poterlo trascinare);
 *  - ogni card di una corsia sta INTERAMENTE dentro la corsia, e la prima è
 *    interamente visibile all'apertura (R4-FIX 6, corsia «Dyr»);
 *  - la corsia densa (>9 opzioni) entra su due righe.
 *
 * Gira nel progetto `editor` (viewport 390×660), non nei progetti desktop/mobile.
 */

const EDITOR_VIEWPORT = { width: 390, height: 660 };

test.use({ viewport: EDITOR_VIEWPORT });

test("il canvas è sticky: resta visibile quando il pannello strumenti è in viewport", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  const canvas = page.getByTestId("preview-sticky");
  const panel = page.getByTestId("details-step");
  await expect(canvas).toBeVisible();
  await expect(panel).toBeVisible();

  // la pagina SCORRE (non è più il vecchio editor a viewport bloccata)
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  );
  expect(scrollable, "lo step 2 mobile è uno scroller verticale di pagina").toBeGreaterThan(0);

  // porto il pannello in viewport e verifico che il canvas sia ANCORA a schermo
  await page.getByTestId("step-nav-flow").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = (await canvas.boundingBox())!;
  expect(box.height, "il canvas ha ancora altezza").toBeGreaterThan(0);
  expect(box.y, "il canvas non è uscito dal viewport dall'alto").toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height, "il canvas è ancora dentro il viewport").toBeLessThanOrEqual(
    EDITOR_VIEWPORT.height
  );
  await expect(page.getByTestId("step-nav-flow")).toBeVisible();
});

test("B1: il pannello strumenti non scorre in verticale, e la pagina non scorre in orizzontale", async ({
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

  // e non deborda mai in larghezza
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.width)).toBeLessThanOrEqual(EDITOR_VIEWPORT.width);

  const pageOverflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(pageOverflowX).toBeLessThanOrEqual(0);
});

test("R4-FIX 6: su TUTTO il catalogo, ogni card sta dentro la sua corsia — e le corsie a immagine si aprono sulla prima", async ({
  page,
}) => {
  // Il difetto («le card della corsia Dyr sbordano») viveva su UN design, non
  // su quello che il configuratore preseleziona: l'invariante si verifica su
  // tutto il catalogo attivo, altrimenti il test guarda dove il bug non c'era.
  const slugs = await activeDesignSlugs();
  expect(slugs.length, "catalogo attivo non vuoto").toBeGreaterThan(0);
  const problems: string[] = [];

  for (const slug of slugs) {
    await page.goto(`/no/configurator?design=${slug}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    const tabs = page
      .getByTestId("category-tabs")
      .locator("button[data-testid^='category-tab-']");
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const name = (await tabs.nth(i).textContent())?.trim() ?? `#${i}`;
      await tabs.nth(i).click();
      const lane = page.getByTestId("option-grid").filter({ visible: true }).first();
      if ((await lane.count()) === 0) continue;

      const g = await lane.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cells = [...el.children].map((c) => c.getBoundingClientRect());
        return {
          verticalScroll: el.scrollHeight - el.clientHeight,
          // una card "sborda" se esce dal bordo ALTO o BASSO della corsia
          clipped: cells.filter((c) => c.top < r.top - 1 || c.bottom > r.bottom + 1).length,
          firstInside:
            cells.length > 0 && cells[0].left >= r.left - 1 && cells[0].right <= r.right + 1,
          // le corsie colore sono radiogroup; quelle a immagine (Dyr &c.) no
          isColour: el.getAttribute("role") === "radiogroup",
        };
      });

      const where = `${slug} / ${name}`;
      if (g.verticalScroll > 0) problems.push(`${where}: la corsia scorre in VERTICALE (${g.verticalScroll}px)`);
      if (g.clipped > 0) problems.push(`${where}: ${g.clipped} card tagliate sopra/sotto`);
      // R4-FIX 6 è sulle corsie a IMMAGINE: si aprono da sinistra, prima card
      // intera. Le corsie colore invece si aprono SULLA scelta corrente (scelta
      // deliberata del giro precedente: altrimenti sembra non esserci selezione),
      // quindi lì la prima card può legittimamente essere già scorsa via.
      if (!g.isColour && !g.firstInside) problems.push(`${where}: la prima card non è interamente visibile`);
    }

    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflowX > 0) problems.push(`${slug}: la pagina scorre in orizzontale (${overflowX}px)`);
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

test("B2: la corsia densa (>9 opzioni) entra per intero — due righe, etichette complete", async ({
  page,
}) => {
  // il gruppo denso si riconosce dal conteggio scritto nella tab: «Nome (N)»,
  // N > 9. Lo si cerca in TUTTO il catalogo: il design preselezionato può non
  // averne uno, e allora il test guarderebbe dove il caso non esiste.
  const slugs = await activeDesignSlugs();
  const tabs = page
    .getByTestId("category-tabs")
    .locator("button[data-testid^='category-tab-']");
  let denseIndex = -1;
  let denseSlug = "";
  for (const slug of slugs) {
    await page.goto(`/no/configurator?design=${slug}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    const labels = await tabs.allTextContents();
    denseIndex = labels.findIndex(
      (l) => Number(l.match(/\((\d+)\)\s*$/)?.[1] ?? 0) > 9
    );
    if (denseIndex >= 0) {
      denseSlug = slug;
      break;
    }
  }
  test.skip(
    denseIndex < 0,
    "nessun gruppo con più di 9 opzioni in catalogo: corsia densa non verificabile qui"
  );
  test.info().annotations.push({ type: "info", description: `corsia densa: ${denseSlug}` });
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

test("R4-RESTYLE: descrizione, didascalia e «Inspirasjonsbilder» vivono in pagina, non in un tab", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await expect(page.getByTestId("details-step")).toBeVisible();

  // i due tab rimossi non esistono più
  await expect(page.getByTestId("category-tab-extras")).toHaveCount(0);
  await expect(page.getByTestId("category-tab-photos")).toHaveCount(0);

  // la didascalia col link alla inspirasjonsside sta sotto il canvas, in pagina
  const note = page.getByTestId("preview-note-mobile");
  await expect(note).toBeVisible();
  await expect(note.getByTestId("preview-note-link")).toHaveAttribute("target", "_blank");

  // la sezione foto c'è solo se il design ha foto reali; se c'è, il tap apre il
  // lightbox condiviso
  const inspiration = page.getByTestId("step2-inspiration");
  if ((await inspiration.count()) > 0) {
    await expect(inspiration).toBeVisible();
    await inspiration.getByTestId("design-photo").first().click();
    await expect(page.getByTestId("design-photo-lightbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("design-photo-lightbox")).toHaveCount(0);
  }

  await expect(page.getByTestId("step2-configure-heading")).toBeVisible();
});

test("R4-FIX 8: il campo «Tekst» compare solo scegliendo un'opzione di testo", async ({
  page,
}) => {
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await expect(page.getByTestId("details-step")).toBeVisible();

  // il gruppo che governa la scritta si riconosce dal nome (stessa euristica del
  // codice, vedi lib/configurator/text-option.ts)
  const tabs = page.getByTestId("category-tabs").locator("button[data-testid^='category-tab-']");
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
