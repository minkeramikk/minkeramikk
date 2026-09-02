import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  activeDesignSlugs as activeSlugs,
  adminClient,
  ceramicCards,
  loginAdmin,
  ADMIN_READY,
  HAS_SERVICE,
} from "./helpers";

/**
 * R4-PDF-MULTIDESIGN — l'evidenza, presa dal percorso VERO.
 *
 * Non costruisce un PDF a mano: ordina davvero dal sito, con un carrello di
 * design DIVERSI, e poi scarica il riepilogo che `after()` ha generato e
 * archiviato — cioè esattamente il file che il cliente riceve per mail. È il
 * caso che ha fatto emergere il difetto (ordine misto → un blocco solo, e
 * l'iscrizione del primo design attribuita a tutto l'ordine).
 *
 * Il peso del file è un AC, non una stima: il nome del file lo porta in chiaro
 * e l'asserzione lo fissa sotto i 300 KB.
 *
 * Tooling, non un gate: gira col progetto `evidence`.
 *   npx playwright test e2e/r4-pdf-multidesign-evidence.spec.ts --project=evidence
 */

const OUT = "docs/evidence/r4-pdf-multidesign";
const MAX_KB = 300;
const createdCodes: string[] = [];

test.afterAll(async () => {
  if (!HAS_SERVICE) return;
  const db = adminClient();
  for (const code of createdCodes) await db.from("orders").delete().eq("code", code);
});

/** Due design attivi diversi; il primo che accetta un'iscrizione va per primo,
 *  così l'evidenza può mostrare il testo su UN design soltanto. */
async function twoDesigns() {
  const { data, error } = await adminClient()
    .from("designs")
    .select("slug, name, accepts_custom_text")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  const all = (data ?? []) as { slug: string; name: string; accepts_custom_text: boolean }[];
  const withText = all.find((d) => d.accepts_custom_text);
  const first = withText ?? all[0];
  const second = all.find((d) => d.slug !== first?.slug);
  return { first, second, textOk: Boolean(withText) };
}

/** Aggiunge al carrello la ceramica in posizione `index` del design aperto. */
async function addCeramic(page: Page, index: number): Promise<string> {
  await page.getByTestId("ceramics-step").waitFor();
  const card = ceramicCards(page).nth(index);
  await expect(card).toBeVisible();
  const name = (await card.innerText()).split("\n")[0].trim();
  await card.click();
  const sheet = page.getByTestId("product-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("add-to-cart").click();
  await expect(sheet).toBeHidden();
  return name;
}

async function checkout(page: Page, locale: "no" | "en"): Promise<string> {
  await page.getByTestId("cart-button").click();
  await page.getByTestId("cart-checkout").click();
  await page.getByTestId("order-form").waitFor();
  await page.getByTestId("order-name").fill("Kari Nordmann");
  await page.getByTestId("order-email").fill("evidence@example.no");
  await page.getByTestId("order-submit").click();
  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  const code = (await page.getByTestId("order-code").innerText()).trim();
  createdCodes.push(code);
  expect(code).toMatch(/^MK-\d+$/);
  expect(page.url()).toContain(`/${locale}/`);
  return code;
}

/** Il riepilogo archiviato. È generato in `after()`, quindi non c'è al momento
 *  della conferma: si aspetta, non si rigenera (l'invariante della card resta). */
async function downloadSummary(page: Page, code: string): Promise<Buffer> {
  const { data: order } = await adminClient()
    .from("orders")
    .select("id")
    .eq("code", code)
    .single();
  const id = (order as { id: string }).id;
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await page.request.get(`/api/admin/orders/${id}/summary`);
    if (res.ok()) return await res.body();
    await page.waitForTimeout(2000);
  }
  throw new Error(`nessun riepilogo archiviato per ${code} dopo 60 s`);
}

/** Quante pagine ha il PDF. `/Type /Page` (non `/Pages`) compare una volta per
 *  pagina nel catalogo del documento: basta contarlo. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function save(name: string, pdf: Buffer): number {
  const kb = Math.round(pdf.byteLength / 1024);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}-${kb}kb.pdf`, pdf);
  return kb;
}

test.describe("R4-PDF-MULTIDESIGN — evidenza", () => {
  test.skip(!ADMIN_READY, "serve admin + service role");
  test.setTimeout(180_000);

  test("NO · tre righe, due design (la forma di MK-1024)", async ({ page }) => {
    const { first, second, textOk } = await twoDesigns();
    test.skip(!second, "serve più di un design attivo nel catalogo");

    // Design A, con un'iscrizione: il PDF deve mostrarla SOLO qui.
    const text = textOk ? "&text=Til+mamma" : "";
    await page.goto(`/no/configurator?design=${first!.slug}&step=3${text}`);
    await addCeramic(page, 0);
    await page.goto(`/no/configurator?design=${first!.slug}&step=3${text}`);
    await addCeramic(page, 1);
    // Design B: la riga che prima finiva sotto il nome del design A.
    await page.goto(`/no/configurator?design=${second!.slug}&step=3`);
    await addCeramic(page, 0);

    const code = await checkout(page, "no");
    await loginAdmin(page);
    const pdf = await downloadSummary(page, code);
    const kb = save(`${code}-no-3-righe-2-design`, pdf);
    expect(kb, `${kb} KB — il budget è < ${MAX_KB} KB`).toBeLessThan(MAX_KB);
  });

  test("EN · due design", async ({ page }) => {
    const { first, second } = await twoDesigns();
    test.skip(!second, "serve più di un design attivo nel catalogo");

    await page.goto(`/en/configurator?design=${first!.slug}&step=3`);
    await addCeramic(page, 0);
    await page.goto(`/en/configurator?design=${second!.slug}&step=3`);
    await addCeramic(page, 0);

    const code = await checkout(page, "en");
    await loginAdmin(page);
    const pdf = await downloadSummary(page, code);
    const kb = save(`${code}-en-2-design`, pdf);
    expect(kb, `${kb} KB — il budget è < ${MAX_KB} KB`).toBeLessThan(MAX_KB);
  });

  test("NO · cinque design — due pagine, quattro piatti", async ({ page }) => {
    // Il caso che rompe la pagina singola: serve a vedere che @react-pdf
    // impagina, che il blocco pagamento NON si spezza (`wrap={false}`), e che
    // oltre il quarto piatto i blocchi restano completi senza immagine.
    // Non ogni design attivo ha ceramiche: si scorre il catalogo finché cinque
    // ne hanno davvero una.
    let added = 0;
    for (const slug of await activeSlugs()) {
      if (added === 5) break;
      await page.goto(`/no/configurator?design=${slug}&step=3`);
      if (await ceramicCards(page).first().isVisible().catch(() => false)) {
        await addCeramic(page, 0);
        added++;
      }
    }
    test.skip(added < 5, `solo ${added} design attivi hanno una ceramica: ne servono 5`);

    const code = await checkout(page, "no");
    await loginAdmin(page);
    const pdf = await downloadSummary(page, code);
    const kb = save(`${code}-no-5-design-2-pagine`, pdf);
    expect(kb, `${kb} KB — il budget è < ${MAX_KB} KB`).toBeLessThan(MAX_KB);
    expect(pageCount(pdf), "cinque design non stanno in una pagina").toBeGreaterThan(1);
  });

  test("NO · un design solo — la non-regressione", async ({ page }) => {
    const { first } = await twoDesigns();
    await page.goto(`/no/configurator?design=${first!.slug}&step=3`);
    await addCeramic(page, 0);

    const code = await checkout(page, "no");
    await loginAdmin(page);
    const pdf = await downloadSummary(page, code);
    const kb = save(`${code}-no-1-design`, pdf);
    expect(kb, `${kb} KB — il budget è < ${MAX_KB} KB`).toBeLessThan(MAX_KB);
  });
});
