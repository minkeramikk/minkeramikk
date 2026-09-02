import { expect, test } from "@playwright/test";
import {
  activeDesignSlugs,
  ceramicCards,
  firstActiveDesign,
  CAN_SEED,
  seedTextGroupDesign,
  deleteDesignBySlug,
  sweepTmpDesigns,
} from "./helpers";

// Lezione f35fix-src-…: un run che crasha lascia il design seminato in
// catalogo, e da lì finisce sul sito. Ogni run parte pulendo i propri.
test.beforeAll(async () => {
  await sweepTmpDesigns();
});

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

  // R4-FOLLOWUPS Ⓓ: sotto il canvas non c'è più la riga-riassunto (era
  // troncata a 390 e ridondante coi dot/conteggi delle tab). Resta la sola
  // didascalia col link alla inspirasjonsside.
  await expect(page.getByTestId("canvas-summary")).toHaveCount(0);
  await expect(page.getByTestId("preview-note-mobile")).toBeVisible();
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

test("CA1: nelle corsie a immagine l'icona sta nella mattonella e la label non si tronca a metà parola", async ({
  page,
}) => {
  const problems: string[] = [];
  for (const slug of await activeDesignSlugs()) {
    await page.goto(`/no/configurator?design=${slug}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    const tabs = page
      .getByTestId("category-tabs")
      .locator("button[data-testid^='category-tab-']");
    for (let i = 0; i < (await tabs.count()); i++) {
      await tabs.nth(i).click();
      const lane = page.getByTestId("option-grid").filter({ visible: true }).first();
      if ((await lane.locator('[data-testid="option-icon"]').count()) === 0) continue;
      const bad = await lane.evaluate((el) =>
        [...el.querySelectorAll("button")].flatMap((card) => {
          const icon = card.querySelector('[data-testid="option-icon"]') as HTMLElement | null;
          const label = card.querySelector("[data-option-label]") as HTMLElement | null;
          const out: string[] = [];
          if (!icon || !label) return ["missing icon/label hook"];
          const cs = getComputedStyle(card);
          const inner =
            card.getBoundingClientRect().width -
            parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
            parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
          if (icon.getBoundingClientRect().width > inner + 0.5)
            out.push(`icon ${Math.round(icon.getBoundingClientRect().width)} > inner ${Math.round(inner)}`);
          // clipped without an ellipsis = truncated mid-word
          const ls = getComputedStyle(label);
          if (label.scrollWidth > label.clientWidth + 1 && ls.textOverflow !== "ellipsis")
            out.push(`label "${label.textContent}" clipped with text-overflow:${ls.textOverflow}`);
          // the icon tile must never be line-clamped
          if (getComputedStyle(icon).webkitLineClamp !== "none")
            out.push("icon tile is line-clamped");
          return out;
        })
      );
      bad.forEach((b) => problems.push(`${slug} / tab#${i}: ${b}`));
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
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

test("CA4: la ✕ del lightbox e quella della scheda prodotto sono identiche e su token ink", async ({
  page,
}) => {
  const read = async () =>
    page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "✕" && b.checkVisibility()
      )!;
      const cs = getComputedStyle(btn);
      const r = btn.getBoundingClientRect();
      const after = getComputedStyle(btn, "::after");
      const grow = Math.abs(parseFloat(after.insetBlockStart || "0")) || 0;
      return {
        bg: cs.backgroundColor,
        fg: cs.color,
        hit: [Math.round(r.width + 2 * grow), Math.round(r.height + 2 * grow)],
      };
    });

  // step 2 — photo lightbox
  const slugs = await activeDesignSlugs();
  let withPhotos = "";
  for (const s of slugs) {
    await page.goto(`/no/configurator?design=${s}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    if ((await page.getByTestId("step2-inspiration").count()) > 0) { withPhotos = s; break; }
  }
  expect(withPhotos, "serve un design con foto reali").not.toBe("");
  await page.getByTestId("step2-inspiration").getByTestId("design-photo").first().click();
  await page.getByTestId("design-photo-lightbox").waitFor({ state: "visible" });
  // The lightbox Dialog keeps the base `zoom-in-95` entrance (unlike the
  // product sheet, which overrides it to `zoom-in-100!`): "visible" fires the
  // instant it mounts, mid-animation, so the disc is still scale(.95) — a
  // real 34.2px, not 36px — unless the entrance is let finish first.
  await page
    .getByTestId("design-photo-lightbox")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const lightbox = await read();
  await page.keyboard.press("Escape");

  // step 3 — product sheet
  await page.goto(`/no/configurator?design=${withPhotos}&step=3`);
  await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
  await ceramicCards(page).first().click();
  await page.getByTestId("product-sheet").waitFor({ state: "visible" });
  const sheet = await read();

  expect(lightbox, "le due ✕ devono essere identiche").toEqual(sheet);
  expect(lightbox.hit[0], "hit area ≥ 44px").toBeGreaterThanOrEqual(44);
  expect(lightbox.hit[1], "hit area ≥ 44px").toBeGreaterThanOrEqual(44);
  // ink disc, light glyph — not the light `--background` disc it used to be
  expect(lightbox.bg).not.toBe(lightbox.fg);
});

test("CA5: le corsie opzioni hanno le frecce ‹ ›, e un tap su un'opzione non muove la pagina", async ({
  page,
}) => {
  await page.goto("/no/configurator?design=amalfi-dyr&step=2");
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  // R4-POLISH: ogni CategoryLane resta montata (visibilità via `max-md:hidden`
  // sul fieldset, come già per `option-grid` in CA1) — serve scoping sul
  // pannello VISIBILE, altrimenti il locator colpisce tutte le corsie a colpo.
  const prev = page.getByTestId("option-lane-prev").filter({ visible: true });
  const next = page.getByTestId("option-lane-next").filter({ visible: true });

  // a inizio corsa: destra sì, sinistra no
  await expect(next).toBeVisible();
  await expect(prev).toBeHidden();

  // la freccia scorre la corsia, non la pagina
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const before = await scrollY();
  await next.click();
  await page.waitForTimeout(500);
  await expect(prev).toBeVisible();
  expect(await scrollY(), "la freccia non scrolla la pagina").toBe(before);

  // la freccia sta SOPRA la fade
  const order = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="option-lane-next"]') as HTMLElement;
    const fade = a.parentElement!.querySelector("span[aria-hidden]") as HTMLElement;
    return [Number(getComputedStyle(a).zIndex), Number(getComputedStyle(fade).zIndex)];
  });
  expect(order[0], "freccia sopra la fade").toBeGreaterThan(order[1]);

  // CONTROLLO DI SANITÀ, non la guardia di regressione: questa è la corsia
  // «Dyr», a IMMAGINE (`aria-pressed`), e l'effetto di centratura guarda
  // `[aria-checked="true"]` — su questa corsia non scatta MAI, né prima né
  // dopo la fix (vedi sotto). Ciò che questo blocco prova davvero è solo che
  // `router.replace(..., {scroll:false})` resta tale al click. La vera
  // guardia di regressione (deriva misurata su c0bba2f: 27-29px) sta nel
  // blocco «Hovedfarge» più sotto, l'unico dove l'effetto di centratura gira.
  const lane = page.getByTestId("option-grid").filter({ visible: true }).first();
  const target = lane.locator("> *").nth(5);
  // su un viewport corto (390×660) questa riga eccede il fold: Playwright la
  // porta in vista PRIMA del click (actionability) — è il raggiungimento
  // dell'utente, non la deriva sotto test. Lo anticipiamo qui, cosi `y0`
  // misura DOPO il raggiungimento e isola solo l'eventuale deriva della
  // selezione stessa.
  await target.scrollIntoViewIfNeeded();
  const y0 = await scrollY();
  await target.click();
  await page.waitForTimeout(400);
  expect(await scrollY(), "selezionare un'opzione non scrolla la pagina").toBe(y0);

  // Da qui in poi: la guardia di regressione vera, sulla corsia COLORE
  // («Hovedfarge», `role="radiogroup"`, opzioni `aria-checked`), l'unica dove
  // l'effetto di centratura scatta davvero (deriva misurata su c0bba2f: 29px).
  //
  // DIPENDENZA DAI DATI VIVI (stesso stile di CA3, richiesta TL 28/8):
  // `category-tab-main-color` e il `count > 9` sotto assumono che il design
  // `amalfi-dyr` abbia una categoria «Hovedfarge» con più di 9 opzioni attive
  // (serve perché la corsia sia scrollabile). Se qualcuno rinomina la
  // categoria o ne riduce le opzioni in admin questo test diventa rosso: è un
  // DATO cambiato, non il codice rotto.
  await page.getByTestId("category-tab-main-color").click();
  const colorLane = page.getByTestId("option-grid").filter({ visible: true }).first();
  await colorLane.waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  // il blocco Dyr sopra ha già scrollato la pagina di qualche px: a quella
  // quota il pannello è GIÀ "nearest"-soddisfatto per questa riga (stessa
  // fieldset, stessa posizione), il che maschererebbe una regressione tanto
  // quanto il pre-scroll di Playwright. Si riparte da una quota nota.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const radios = colorLane.locator('[role="radio"]');
  const count = await radios.count();
  expect(count, "«Hovedfarge» deve scorrere davvero").toBeGreaterThan(9);
  const checkedIndex = await colorLane.evaluate((el) =>
    [...el.querySelectorAll('[role="radio"]')].findIndex(
      (r) => r.getAttribute("aria-checked") === "true"
    )
  );
  // l'ULTIMA opzione: fuori dalla vista iniziale, quindi costringe l'effetto
  // a un vero ricentraggio.
  const farIndex = checkedIndex === count - 1 ? 0 : count - 1;
  const laneScrollLeft = () => colorLane.evaluate((el) => el.scrollLeft);

  const yBeforeColor = await scrollY();
  const slBefore = await laneScrollLeft();
  // `dispatchEvent`, non `.click()`: `.click()` fa scattare il pre-scroll di
  // actionability di Playwright (porta il bersaglio in vista PRIMA di
  // cliccare), che maschererebbe esattamente la deriva sotto test — lo stesso
  // raggiro del blocco Dyr sopra, qui sulla corsia intera. `dispatchEvent`
  // spara l'evento nativo `click` senza toccare NESSUno scroll: solo il
  // nostro effetto può muovere qualcosa, da qui in poi.
  await radios.nth(farIndex).dispatchEvent("click");
  await page.waitForTimeout(400);
  expect(
    await scrollY(),
    "selezionare un colore non scrolla la pagina"
  ).toBe(yBeforeColor);
  expect(
    await laneScrollLeft(),
    "selezionare un colore RICENTRA la corsia (prova che l'effetto è girato davvero)"
  ).not.toBe(slBefore);
});

test("CA5-bis: a riposo, il tab attivo e la prima card non riposano sotto i dischi freccia", async ({
  page,
}) => {
  // DIPENDENZA DAI DATI VIVI: `amalfi-dyr` è il design con abbastanza gruppi
  // (6 tab) e abbastanza opzioni (14 animali, 20 colori) da far comparire le
  // frecce a 390px. Se l'admin gli toglie categorie o opzioni le frecce non
  // appaiono più e questo test perde il suo soggetto: è un dato, non il codice.
  await page.goto("/no/configurator?design=amalfi-dyr&step=2");
  await page.getByTestId("details-step").waitFor({ state: "visible" });

  /** Rettangoli dei dischi VISIBILI, area toccabile compresa (`after:-inset-1`). */
  const discs = async (prev: string, next: string) =>
    page.evaluate(
      ([p, n]) =>
        [p, n]
          .map((id) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)
          .filter((el): el is HTMLElement => !!el && el.checkVisibility())
          .map((el) => {
            const b = el.getBoundingClientRect();
            const grow = Math.abs(parseFloat(getComputedStyle(el, "::after").insetInlineStart)) || 0;
            return { left: b.left - grow, right: b.right + grow, top: b.top, bottom: b.bottom };
          }),
      [prev, next]
    );

  const overlaps = (
    a: { left: number; right: number; top: number; bottom: number },
    b: { left: number; right: number; top: number; bottom: number }
  ) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

  // ── la barra tab ────────────────────────────────────────────────────────
  const tabsNext = page.getByTestId("category-tabs-next");
  await expect(tabsNext, "a 390 la barra tab deve avere corsa").toBeVisible();

  // (a) scroll-padding: dopo uno scorrimento con la freccia, il PRIMO tab non
  //     tagliato dal bordo — quello che l'utente legge — non è sotto un disco.
  //     Non si guarda il tab attivo: una freccia può portarlo fuori vista, e un
  //     elemento fuori vista non interseca niente, cioè l'asserzione sarebbe
  //     vuota. (Verificato: lo era.)
  await tabsNext.click();
  await page.waitForTimeout(1000);
  const firstWholeTab = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="category-tabs"]') as HTMLElement;
    const br = bar.getBoundingClientRect();
    const b = [...bar.querySelectorAll("[data-testid^='category-tab-']")]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.left >= br.left - 1);
    return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null;
  });
  expect(firstWholeTab, "un tab intero dev'essere visibile a riposo").not.toBeNull();
  for (const d of await discs("category-tabs-prev", "category-tabs-next")) {
    expect(
      overlaps(firstWholeTab!, d),
      "il primo tab intero non riposa sotto un disco freccia"
    ).toBe(false);
  }

  // (b) auto-scroll: attivare COL DITO un tab mezzo coperto lo porta in chiaro.
  //     `dispatchEvent` e non `click()`: il click di Playwright scrolla da sé
  //     l'elemento in vista (actionability) e coprirebbe proprio il buco che
  //     questo pezzo sorveglia — un dito umano non fa nulla del genere.
  //     Verificato: con `click()`, o misurando durante l'animazione di scroll,
  //     l'asserzione passa anche disattivando l'auto-scroll: è vuota.
  const tabs = page.locator("[data-testid^='category-tab-']");
  const covered = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="category-tabs"]') as HTMLElement;
    const disc = document.querySelector(
      '[data-testid="category-tabs-next"]'
    ) as HTMLElement;
    const d = disc.getBoundingClientRect();
    return [...bar.querySelectorAll("[data-testid^='category-tab-']")].findIndex((el) => {
      const b = el.getBoundingClientRect();
      return Math.min(b.right, d.right) - Math.max(b.left, d.left) > 1;
    });
  });
  expect(covered, "serve un tab mezzo coperto dal disco ›").toBeGreaterThanOrEqual(0);
  await tabs.nth(covered).dispatchEvent("click");
  await page.waitForTimeout(1000);
  const activeBox = await page.evaluate(() => {
    const el = document.querySelector(
      "[data-testid^='category-tab-'][aria-selected='true']"
    ) as HTMLElement;
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  });
  for (const d of await discs("category-tabs-prev", "category-tabs-next")) {
    expect(
      overlaps(activeBox, d),
      "un tab attivato col dito non resta sotto un disco freccia"
    ).toBe(false);
  }

  // ── la corsia opzioni ───────────────────────────────────────────────────
  await tabs.first().click(); // «Dyr», corsia a immagine che scorre
  await page.waitForTimeout(400);
  const laneNext = page.getByTestId("option-lane-next").filter({ visible: true }).first();
  await expect(laneNext, "la corsia «Dyr» deve avere corsa").toBeVisible();
  await laneNext.click();
  await page.waitForTimeout(900);

  const laneGeom = await page.evaluate(() => {
    const lane = [...document.querySelectorAll('[data-testid="option-grid"]')].find(
      (el) => (el as HTMLElement).checkVisibility()
    ) as HTMLElement;
    const lr = lane.getBoundingClientRect();
    // la PRIMA card non tagliata dal bordo iniziale: è quella che l'utente
    // legge, e quella che non deve stare sotto il disco. Le card mezze fuori
    // dal bordo restano il segnale «c'è dell'altro».
    const first = [...lane.querySelectorAll("button")]
      .map((c) => c.getBoundingClientRect())
      .find((b) => b.left >= lr.left - 1);
    return first
      ? { left: first.left, right: first.right, top: first.top, bottom: first.bottom }
      : null;
  });
  expect(laneGeom, "una card intera dev'essere visibile a riposo").not.toBeNull();
  for (const d of await discs("option-lane-prev", "option-lane-next")) {
    expect(
      overlaps(laneGeom!, d),
      "la prima card intera non riposa sotto un disco freccia"
    ).toBe(false);
  }
});

test("Ⓒ: la barra tab è sticky sotto il canvas — raggiungibile anche a fondo pagina", async ({
  page,
}) => {
  // DIPENDENZA DAI DATI VIVI, come CA5-bis: `amalfi-dyr` + il tab «Fargeønsker»
  // è il pannello PIÙ ALTO del catalogo (note colore + figura + textarea), cioè
  // l'unico che a 390×660 dà abbastanza corsa perché il difetto si veda. Se
  // l'admin gli toglie le note il test perde il suo soggetto: è un dato.
  //
  // Il difetto NON era la barra fuori schermo: era la barra sotto il CANVAS.
  // Il canvas è sticky a top-14 e sta su `z-30`, la barra scorreva via sotto di
  // lui. Misurato a fondo pagina su questo design (fondo pagina, tab
  // «Fargeønsker»): senza sticky la barra si ferma a y=246 con il canvas che
  // arriva a 294 — coperta; a 560 di altezza y=110 contro 258, sparita del
  // tutto. Con lo sticky si ferma esattamente al bordo inferiore del canvas.
  await page.goto("/no/configurator?design=amalfi-dyr&step=2");
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  const wishes = page.getByTestId("category-tab-wishes");
  await expect(wishes, "serve il tab col pannello più alto").toBeVisible();
  await wishes.click();

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await page.waitForTimeout(300);

  const g = await page.evaluate(() => {
    const b = (sel: string) =>
      (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
    const bar = b('[data-testid="category-tabs"]');
    const canvas = b("[data-preview-column]");
    return {
      barTop: bar.top,
      barBottom: bar.bottom,
      canvasBottom: canvas.bottom,
      vh: window.innerHeight,
      scrollRange:
        document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  // guardia anti-asserzione-vuota: senza corsa la barra non ha modo di finire
  // sotto il canvas, e i tre expect qui sotto passerebbero da soli.
  expect(g.scrollRange, "la pagina deve avere corsa vera").toBeGreaterThan(300);
  expect(g.barTop, "la barra tab non è uscita dal viewport dall'alto").toBeGreaterThanOrEqual(-1);
  expect(g.barBottom, "la barra tab è tutta dentro il viewport").toBeLessThanOrEqual(g.vh);
  expect(
    g.barTop,
    "la barra parcheggia SOTTO il canvas sticky, non dietro"
  ).toBeGreaterThanOrEqual(g.canvasBottom - 1);

  // e da lì è davvero usabile: un tap cambia tab senza risalire
  const first = page.locator("[data-testid^='category-tab-']").first();
  await first.click();
  await expect(first).toHaveAttribute("aria-selected", "true");
});

test("Ⓒ: col focus sul campo scritta la barra tab molla lo sticky insieme al canvas, e la nav si aggancia al fondo", async ({
  page,
}) => {
  // La barra è agganciata AL CANVAS: quando il canvas molla (`data-typing`,
  // R4-POLISH voce 8), molla anche lei. Agganciata all'header resterebbe a
  // 56px, cioè esattamente sulla striscia in cui `keepClearOfKeyboard` porta il
  // campo scritta, e lo coprirebbe.
  // Si commuta `data-typing` direttamente: la sorgente di quello stato (focus →
  // `setTyping`) è già coperta da CA2, qui si sorveglia l'ACCOPPIAMENTO fra il
  // canvas e la barra, che è puro CSS. Così il test non deve seminare un design
  // «Tekst» nel catalogo di produzione per esistere.
  const design = await firstActiveDesign();
  await page.goto(`/no/configurator?design=${design.slug}&step=2`);
  await page.getByTestId("details-step").waitFor({ state: "visible" });

  const positions = () =>
    page.evaluate(() => {
      const bar = document.querySelector('[data-testid="category-tabs"]')!
        .parentElement as HTMLElement;
      const canvas = document.querySelector(
        "[data-preview-column]"
      ) as HTMLElement;
      const nav = document.querySelector(
        '[data-testid="step-nav-flow"]'
      ) as HTMLElement;
      return {
        bar: getComputedStyle(bar).position,
        canvas: getComputedStyle(canvas).position,
        // R4-STEP2-KEYBOARD ③: la nav fa il contrario degli altri due — si
        // aggancia mentre si scrive, così Back/Next stanno sopra la tastiera.
        nav: getComputedStyle(nav).position,
      };
    });

  expect(await positions(), "a riposo: canvas e barra sticky, nav in flusso").toEqual({
    bar: "sticky",
    canvas: "sticky",
    nav: "static",
  });

  await page.evaluate(() =>
    (document.querySelector("[data-preview-column]")!
      .parentElement as HTMLElement).setAttribute("data-typing", "1")
  );
  expect(
    await positions(),
    "col campo a fuoco la barra molla lo sticky INSIEME al canvas, e la nav lo prende"
  ).toEqual({ bar: "static", canvas: "static", nav: "sticky" });
});

test("CA3: «Fargeønsker» è un tab, esiste solo dove serve, e non lascia form sotto il pannello", async ({
  page,
}) => {
  // DIPENDENZA DAI DATI VIVI (richiesta TL 28/8): questo test sceglie due design
  // REALI per le loro proprietà di catalogo — `krabbe` ha
  // accepts_custom_notes=true e un sync_group, `striper` non ha né note né sync
  // né accepts_custom_text. Se qualcuno le cambia in admin questo test diventa
  // rosso: è un DATO cambiato, non il codice rotto.
  // Verificato 2026-08-28: krabbe notes=true sync=crab · striper tutto false.
  // krabbe: note colore + figura + lås farger → il tab esiste
  await page.goto("/no/configurator?design=krabbe&step=2");
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  const tab = page.getByTestId("category-tab-wishes");
  await expect(tab).toBeVisible();
  await expect(tab, "senza contatore").toHaveText("Fargeønsker");

  // finché non è attivo, il suo contenuto non è in pagina
  await expect(page.getByTestId("custom-notes")).toBeHidden();
  await tab.click();
  await expect(page.getByTestId("custom-notes")).toBeVisible();
  await expect(page.getByTestId("colour-notes-figure")).toBeVisible();
  await expect(tab).toHaveAttribute("aria-selected", "true");

  // aprendo il tab, le corsie opzioni spariscono: un solo pannello per volta
  await expect(page.getByTestId("option-grid").filter({ visible: true })).toHaveCount(0);

  // niente residui sotto il pannello: l'ultimo figlio è la nav
  const lastId = await page.getByTestId("details-step").evaluate(
    (el) => (el.lastElementChild as HTMLElement).dataset.testid
  );
  expect(lastId).toBe("step-nav-flow");

  // striper: niente note, niente sync, niente testo → nessun tab
  await page.goto("/no/configurator?design=striper&step=2");
  await page.getByTestId("details-step").waitFor({ state: "visible" });
  await expect(page.getByTestId("category-tab-wishes")).toHaveCount(0);
  await expect(page.getByTestId("step2-extras")).toBeHidden();
});

test("CA2: il campo «Tekst» è gated e non si sovrappone né alle opzioni né alla nav", async ({
  page,
}) => {
  // skip DICHIARATO (lezione F07) quando il seeding non è abilitato: semina nel
  // catalogo reale, quindi vuole una scelta esplicita (controller Ruling 1).
  test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: il test semina un design «Tekst»");
  const { slug } = await seedTextGroupDesign();
  try {
    await page.goto(`/no/configurator?design=${slug}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    const tabs = page
      .getByTestId("category-tabs")
      .locator("button[data-testid^='category-tab-']");
    const idx = (await tabs.allTextContents()).findIndex((l) => /^tekst/i.test(l.trim()));
    expect(
      idx,
      "il design seminato non è visibile: il catalogo è in `unstable_cache` senza " +
        "revalidate e il webServer di Playwright lo congela al primo GET — " +
        "seminare PRIMA di `next build`"
    ).toBeGreaterThanOrEqual(0);
    await tabs.nth(idx).click();

    // «No color» (prima opzione, default): nessun campo
    const lane = page.getByTestId("option-grid").filter({ visible: true }).first();
    await lane.locator("> *").first().click();
    await expect(page.getByTestId("custom-text")).toHaveCount(0);

    // «Tekst 1»: il campo compare SOTTO la corsia, senza sovrapporsi a nulla
    await lane.locator("> *").nth(1).click();
    await expect(page.getByTestId("custom-text")).toBeVisible();

    const boxes = await page.evaluate(() => {
      const b = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      };
      return {
        lane: b('fieldset[data-testid="category-tekst"] [data-testid="option-grid"]'),
        field: b('[data-testid="custom-text"]'),
        nav: b('[data-testid="step-nav-flow"]'),
      };
    });
    expect(boxes.field!.top, "il campo sta SOTTO la corsia").toBeGreaterThanOrEqual(
      boxes.lane!.bottom - 1
    );
    expect(boxes.nav!.top, "la nav sta SOTTO il campo, mai coperta").toBeGreaterThanOrEqual(
      boxes.field!.bottom - 1
    );

    // il focus non nasconde il campo dietro il canvas sticky
    await page.getByTestId("custom-text-input").click();
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const f = document.querySelector('[data-testid="custom-text-input"]')!.getBoundingClientRect();
      const c = document.querySelector('[data-testid="preview-sticky"]')!.getBoundingClientRect();
      return { fieldTop: f.top, fieldBottom: f.bottom, canvasBottom: c.bottom, vh: window.innerHeight };
    });
    expect(after.fieldTop, "il campo non finisce sotto il canvas sticky").toBeGreaterThanOrEqual(
      after.canvasBottom - 1
    );
    expect(after.fieldBottom, "il campo resta nel viewport").toBeLessThanOrEqual(after.vh);
  } finally {
    await deleteDesignBySlug(slug);
  }
});

test("CA6: nessuna fade copre testo statico, su nessun design e nessun tab", async ({
  page,
}) => {
  // Il difetto originale erano DUE colonne sfumate alte quanto la pagina sopra
  // la descrizione e la didascalia: le fade della barra tab erano `absolute`
  // dentro un wrapper senza `relative`, quindi si risolvevano contro il blocco
  // contenitore iniziale. È chiuso in c0bba2f — questo test è ciò che impedisce
  // che torni, ora che aggiungiamo fade e form nuovi.
  const problems: string[] = [];
  for (const slug of await activeDesignSlugs()) {
    for (const step of [2, 3]) {
      await page.goto(`/no/configurator?design=${slug}&step=${step}`);
      await page
        .getByTestId(step === 2 ? "details-step" : "ceramics-step")
        .waitFor({ state: "visible" });
      const tabs =
        step === 2
          ? page.getByTestId("category-tabs").locator("button[data-testid^='category-tab-']")
          : null;
      const n = tabs ? await tabs.count() : 1;
      for (let i = 0; i < n; i++) {
        if (tabs) await tabs.nth(i).click();
        const hits = await page.evaluate(() => {
          const lit = (el: Element) => {
            const s = getComputedStyle(el);
            return (
              s.position === "absolute" &&
              s.pointerEvents === "none" &&
              /gradient/.test(s.backgroundImage) &&
              s.display !== "none" &&
              s.opacity !== "0"
            );
          };
          const scrolls = (el: HTMLElement) =>
            el.scrollWidth > el.clientWidth + 2 &&
            getComputedStyle(el).overflowX !== "visible";
          const inScroller = (el: HTMLElement | null) => {
            for (let q = el; q; q = q.parentElement) if (scrolls(q)) return true;
            return false;
          };
          const out: string[] = [];
          for (const fade of [...document.querySelectorAll("span,div")].filter(lit)) {
            const fr = fade.getBoundingClientRect();
            if (!fr.width || !fr.height) continue;
            for (const node of document.querySelectorAll("p,h1,h2,h3,label,legend")) {
              const el = node as HTMLElement;
              if (!el.textContent?.trim() || el.contains(fade)) continue;
              // il contenuto DENTRO una corsia orizzontale può sfumare: è il
              // segnale «c'è dell'altro». Il testo statico no.
              if (inScroller(el)) continue;
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) continue;
              const ox = Math.min(fr.right, r.right) - Math.max(fr.left, r.left);
              const oy = Math.min(fr.bottom, r.bottom) - Math.max(fr.top, r.top);
              if (ox > 1 && oy > 1)
                out.push(`fade over <${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 40)}"`);
            }
          }
          return [...new Set(out)];
        });
        hits.forEach((h) => problems.push(`${slug} step${step} tab#${i}: ${h}`));
      }
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("le frecce della barra tab compaiono quando è il CONTENUTO a traboccare", async ({
  page,
}) => {
  // La regressione che questo test esiste per proteggere: `useLaneFades`
  // osservava col ResizeObserver il solo CONTENITORE, che NON cambia larghezza
  // quando cresce il contenuto. Con `font-display: swap` i chip nascono col
  // font di ripiego e si allargano quando arriva Poppins: la corsia trabocca e
  // nessun evento parte, quindi `category-tabs-next` restava `hidden` finché
  // l'utente non scorreva a mano. Misurato a 390 prima del fix: traccia da 366
  // a 458px, freccia ancora nascosta.
  //
  // Il font non si può far arrivare tardi in modo deterministico, quindi si
  // riproduce la CAUSA, non il suo innesco: si allarga il contenuto a
  // contenitore fermo. Due volte, perché sono due box diversi — il padding
  // muove solo il border box (per questo l'osservatore guarda quello), la
  // dimensione del testo muove anche il content box.
  const lane = page.getByTestId("category-tabs");
  const next = page.getByTestId("category-tabs-next");
  const overflow = () => lane.evaluate((el) => el.scrollWidth - el.clientWidth);

  // Serve la corsia PIÙ LARGA fra quelle che NON traboccano già: una che
  // trabocca avrebbe la freccia accesa per un altro motivo, e la più stretta
  // (un tab solo) può restare dentro i 390px anche gonfiata, rendendo il test
  // vacuo. La più larga è il caso vero: quella a un soffio dal bordo, che il
  // font in swap fa traboccare.
  const slugs = await activeDesignSlugs();
  let narrow = "";
  let widest = -1;
  for (const slug of slugs) {
    await page.goto(`/en/configurator?design=${slug}&step=2`);
    await lane.waitFor();
    if ((await overflow()) > 2) continue;
    const w = await lane.evaluate((el) =>
      [...el.querySelectorAll("[data-testid^='category-tab-']")].reduce(
        (sum, t) => sum + t.getBoundingClientRect().width,
        0
      )
    );
    if (w > widest) {
      widest = w;
      narrow = slug;
    }
  }
  expect(narrow, "nessun design ha una barra tab che sta dentro i 390px").not.toBe("");

  for (const which of ["padding", "font"] as const) {
    await page.goto(`/en/configurator?design=${narrow}&step=2`);
    await lane.waitFor();
    await expect(next).toBeHidden();

    await lane.evaluate((el, w) => {
      for (const t of el.querySelectorAll<HTMLElement>(
        "[data-testid^='category-tab-']"
      )) {
        if (w === "padding") t.style.paddingInline = "60px";
        else t.style.fontSize = "22px";
      }
    }, which);

    await expect
      .poll(overflow, { message: `${which}: il contenuto non è cresciuto` })
      .toBeGreaterThan(2);
    await expect(
      next,
      `${which}: la corsia trabocca ma la freccia è restata nascosta`
    ).toBeVisible();
  }
});
