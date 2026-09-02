import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { activeDesignSlugs, adminClient, ceramicCards } from "./helpers";

/**
 * R4-IMG-512 — evidenza (tooling, NON un gate).
 *
 * Gira contro `npm run dev` sulla 3199 (ricalibrazione 2/9: evidenza puntuale
 * contro dev, non contro `make build`):
 *   npm run dev -- -p 3199
 *   npx playwright test e2e/r4-img-512-evidence.spec.ts --project=evidence
 *
 * Due cose sole:
 *  a) AC3 — il peso trasferito. Si intercettano le risposte `assets/products/`
 *     allo step 3 e si somma quel che scarica il primo viewport. Il "prima" NON
 *     si rimisura su un altro commit: è la stessa lista di card letta alla @1024
 *     dai byte che Storage riporta per quegli oggetti, cioè esattamente i file
 *     che il codice precedente chiedeva. Confronto sui byte veri, un giro solo.
 *  b) AC5 — lo scatto della griglia a 390/768/1280 con `deviceScaleFactor: 2`:
 *     è a DPR2 che una 512 sgranerebbe, quindi è a DPR2 che va guardata.
 */
const OUT = "docs/evidence/r4-img-512";
const WIDTHS = [390, 768, 1280] as const;
mkdirSync(OUT, { recursive: true });

/**
 * Il primo design attivo la cui griglia è una griglia vera. Un design con una
 * lista `design_products` corta (in staging `striper-dan` ne ha uno) mostra UNA
 * card: il peso del primo viewport misurato lì non dice niente. Si prende il
 * primo che ne rende almeno quattro — cioè il catalogo del fornitore, che è il
 * caso di prod.
 */
async function designWithAFullGrid(page: import("@playwright/test").Page) {
  for (const slug of await activeDesignSlugs()) {
    await page.goto(`/no/configurator?design=${slug}&step=3`);
    await page.getByTestId("ceramics-step").waitFor();
    if ((await ceramicCards(page).count()) >= 4) return slug;
  }
  throw new Error("nessun design attivo mostra 4+ ceramiche");
}

test("AC3 + AC5: step 3 chiede la @512, e a DPR2 non si vede la differenza", async ({
  browser,
}) => {
  const db = adminClient();
  const { data } = await db.storage.from("assets").list("products", { limit: 1000 });
  const bytes = new Map((data ?? []).map((o) => [`products/${o.name}`, o.metadata?.size ?? 0]));

  // scelto UNA volta, su una pagina a parte: sondare i design dentro il giro di
  // misura conterebbe anche le immagini caricate dai design scartati.
  const probe = await browser.newPage();
  const design = await designWithAFullGrid(probe);
  await probe.close();
  const report: Record<string, unknown> = { design };

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const loaded = new Set<string>();
    page.on("response", (r) => {
      const m = r.url().match(/\/assets\/(products\/[^?]+)/);
      if (m) loaded.add(m[1]);
    });

    await page.goto(`/no/configurator?design=${design}&step=3`);
    await page.getByTestId("ceramics-step").waitFor();
    // le card sono `loading="lazy"`: si lascia atterrare il primo viewport
    await page.waitForTimeout(2500);

    // AC3: ogni foto della card è la @512, non la @1024 della sheet
    const cards = page.getByTestId("ceramics-step").locator('img[data-testid="product-thumb"]');
    for (const src of await cards.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src))) {
      expect(src).toContain("@512.webp");
    }

    const after = [...loaded].reduce((n, p) => n + (bytes.get(p) ?? 0), 0);
    const before = [...loaded].reduce(
      (n, p) => n + (bytes.get(p.replace("@512.webp", "@1024.webp")) ?? 0),
      0
    );
    report[`w${width}`] = {
      images: loaded.size,
      kbNow: Math.round(after / 1024),
      kbAt1024: Math.round(before / 1024),
      saved: before ? `-${Math.round((1 - after / before) * 100)}%` : "n/a",
    };

    await page
      .getByTestId("ceramics-step")
      .screenshot({ path: `${OUT}/step3-${width}.png` });
    await ctx.close();
  }

  writeFileSync(`${OUT}/network.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
});
