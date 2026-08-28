import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  loadEnvLocal,
  adminClient,
  activeDesignSlugs,
  ceramicCards,
  CAN_SEED,
  seedTextGroupDesign,
  deleteDesignBySlug,
} from "./helpers";

loadEnvLocal();
const OUT08 = "docs/evidence/f08";

test("F08: real production-order PDF from a test order (2 lines)", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "needs admin + service role"
  );
  mkdirSync(OUT08, { recursive: true });
  const db = adminClient();
  const code = `MK-EVID-F08-${Date.now()}`;
  const { data: designs } = await db
    .from("designs")
    .select("code, slug, name")
    .not("code", "is", null)
    .limit(2);
  const { data: supplier } = await db.from("suppliers").select("id, name").limit(1).single();
  const { data: order } = await db
    .from("orders")
    .insert({ code, customer_name: "Evidence", email: "e@example.no", locale: "no", status: "new" })
    .select("id")
    .single();
  const lines = (designs ?? []).map((d, i) => ({
    order_id: order!.id,
    supplier_id: supplier!.id,
    supplier_name_snapshot: supplier!.name,
    product_name_snapshot: i === 0 ? "Vietri Flat" : "Serveringsfat Stor",
    price_cents_snapshot: 50000,
    currency_snapshot: "NOK",
    quantity: i === 0 ? 4 : 2,
    config_code: `MK-${d.code}`,
    config_snapshot: { designSlug: d.slug, designName: d.name, selections: [] },
  }));
  await db.from("order_items").insert(lines);

  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });

  const res = await page.request.get(
    `/api/admin/orders/${order!.id}/pdf?supplier=${supplier!.id}`
  );
  writeFileSync(`${OUT08}/production-order-sample.pdf`, await res.body());

  await db.from("orders").delete().eq("id", order!.id);
});

const OUT10 = "docs/evidence/f10";

test("F10a: designs list + design detail (form + categories + preview)", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "needs a seeded admin"
  );
  mkdirSync(OUT10, { recursive: true });
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/admin/designs");
  await page.getByTestId("admin-designs").waitFor();
  await page.screenshot({ path: `${OUT10}/f10-designs-list.png` });

  // detail of the first design: form + nested categories + composed preview
  await page.getByTestId("design-row").first().getByTestId("design-edit").click();
  await page.getByTestId("design-detail").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT10}/f10-design-detail.png`, fullPage: true });

  // F10b/F22: options are managed inline in the design tree — expand the
  // first category accordion and capture it
  await page.getByTestId("category-summary").first().click();
  await page.getByTestId("tree-options-list").first().waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT10}/f10-options.png`, fullPage: true });
});

const OUT09 = "docs/evidence/f09";
const OUT39 = "docs/evidence/f39";

test("F09: catalog CRUD — products/suppliers lists + product form", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "needs a seeded admin"
  );
  mkdirSync(OUT09, { recursive: true });
  mkdirSync(OUT39, { recursive: true });
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/products");
  await page.getByTestId("admin-products").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-products-list.png` });

  await page.goto("/admin/products/new");
  await page.getByTestId("product-form").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-product-form.png` });

  await page.goto("/admin/suppliers");
  await page.getByTestId("admin-suppliers").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-suppliers-list.png` });

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin/products/new");
  await page.getByTestId("product-form").waitFor();
  await page.screenshot({ path: `${OUT09}/f09-product-form-390.png` });

  // Desktop evidence — reset from the 390px mobile viewport set above.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/products");
  await page.getByTestId("product-group").first().waitFor();
  await page.screenshot({ path: `${OUT39}/f39-products-by-supplier.png`, fullPage: true });

  await page.goto("/admin/products/clone");
  await page.getByTestId("clone-ceramics").waitFor();
  await page.screenshot({ path: `${OUT39}/f39-clone-ceramics.png`, fullPage: true });
});

const OUT06 = "docs/evidence/f06";

test("F06: login page + anon→login redirect at 390/1280", async ({ page }) => {
  mkdirSync(OUT06, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 800 });
    await page.goto("/admin"); // anon → redirected to login
    await page.getByTestId("login-form").waitFor({ state: "visible" });
    await page.screenshot({ path: `${OUT06}/f06-login-${width}.png` });
  }
});

test("F06: AdminShell (dashboard) desktop + mobile, after login", async ({ page }) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "needs a seeded admin"
  );
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("logout").waitFor({ state: "visible" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 800 });
    await page.goto("/admin");
    await page.getByTestId("logout").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT06}/f06-shell-${width}.png` });
  }
});

/**
 * PR evidence (not assertions): full-page screenshots of step 1 at the
 * three reference breakpoints, with a design selected.
 */
const OUT15 = "docs/evidence/f15";

test("F15: step 2 real assets — colors + animals at 390/1280", async ({ page }) => {
  mkdirSync(OUT15, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1500 : 1100 });
    // real glaze swatches in a wrapping grid (no carousel)
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT15}/f15-colors-${width}.png`, fullPage: true });
    // original animal art on tiles (no mask)
    await page.goto("/no/configurator?design=amalfi-dyr&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT15}/f15-animals-${width}.png`, fullPage: true });
  }
});

test("F15 sticky: preview pinned while scrolling the options (390 collapsed + 1280)", async ({
  page,
}) => {
  mkdirSync(OUT15, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 780 : 800 });
    await page.goto("/no/configurator?design=amalfi-dyr&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    // scroll mid-list: the preview stays pinned (mobile: collapsed thumbnail)
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT15}/f15-sticky-${width}.png` });
  }
});

const OUT05 = "docs/evidence/f05";

test("F05: order form + confirmation at 390/1280", async ({ page }) => {
  mkdirSync(OUT05, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1300 });
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("add-to-cart").click();
    // F16: checkout lives in the cart drawer
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("order-form").waitFor({ state: "visible" });
    await page.getByTestId("order-name").fill("Kari Nordmann");
    await page.getByTestId("order-email").fill("kari@example.no");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT05}/f05-form-${width}.png`, fullPage: true });
  }
  // confirmation page
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/no/order?code=MK-1042");
  await page.getByTestId("order-confirmation").waitFor({ state: "visible" });
  await page.screenshot({ path: `${OUT05}/f05-confirmation.png`, fullPage: true });
});

const OUT13 = "docs/evidence/f13";

test("F13: textured swatches, monochrome icons, hover preview", async ({
  page,
}) => {
  mkdirSync(OUT13, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1400 : 1000 });
    // colour swatches + hover popup (desktop widths only)
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    if (width >= 768) {
      await page
        .getByTestId("category-details")
        .getByRole("radio")
        .nth(2)
        .hover();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${OUT13}/f13-swatches-${width}.png`, fullPage: true });
    // monochrome animal icons (normal + selected)
    await page.goto("/no/configurator?design=amalfi-dyr&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT13}/f13-icons-${width}.png`, fullPage: true });
  }
});

// BUG-1: the "F14 side-by-side" capture was removed — it only took fullPage
// screenshots with no Buffer.compare, so it asserted nothing ("preview
// identical" lived in the title only). f14.spec.ts AC2 is the real gate for
// the step1↔step2 preview-width invariant.

const OUT = "docs/evidence/f01";

test("capture 390/768/1280 screenshots", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto("/no/configurator?design=blomster-1");
    await page
      .locator('img[alt="Blomster 1"]')
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(800); // image paint
    await page.screenshot({
      path: `${OUT}/f01-${width}.png`,
      fullPage: true,
    });
  }
});

const OUT3 = "docs/evidence/f03";

test("F03: capture 390/768/1280 with a populated cart", async ({ page }) => {
  mkdirSync(OUT3, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1100 : 1000 });
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("qty-inc").click();
    await page.getByTestId("add-to-cart").click();
    await page.getByTestId("product-serveringsfat-stor").click();
    await page.getByTestId("add-to-cart").click();
    // F16: the populated cart now lives in the drawer
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-drawer").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT3}/f03-${width}.png`, fullPage: true });
  }
});

const OUT16 = "docs/evidence/f16";

test("F16: cart drawer + badge at 390/1280", async ({ page }) => {
  mkdirSync(OUT16, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    // populate from step 3
    await page.goto("/no/configurator?design=blomster-1&step=3");
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await page.getByTestId("product-vietri-flat").click();
    await page.getByTestId("qty-inc").click();
    await page.getByTestId("add-to-cart").click();
    await page.getByTestId("product-serveringsfat-stor").click();
    await page.getByTestId("add-to-cart").click();
    // badge in the header
    await page.getByTestId("cart-badge").waitFor({ state: "visible" });
    // open drawer
    await page.getByTestId("cart-button").click();
    await page.getByTestId("cart-drawer").waitFor({ state: "visible" });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT16}/f16-drawer-${width}.png` });
    // checkout phase
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("order-form").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT16}/f16-checkout-${width}.png` });
  }
});

const OUT2 = "docs/evidence/f02";

test("F02: capture 390/768/1280 with selections + composed preview", async ({
  page,
}) => {
  mkdirSync(OUT2, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 700 ? 1100 : 1000 });
    await page.goto("/no/configurator?design=blomster-1&step=2");
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    // make a colour choice in each category so the preview composes
    if (width < 768) {
      // R4-STEP2: sotto md solo la corsia della tab categoria ATTIVA è nel
      // DOM accessibile (le altre sono `max-md:hidden`, configurator-client
      // .tsx `!active && "max-md:hidden"` sul fieldset di CategoryLane) — va
      // aperta ogni tab prima di poterne selezionare l'opzione.
      // R4-RESTYLE: la corsia tab è fatta SOLO di gruppi-opzione, quindi non
      // c'è più nessuna tab non-categoria da saltare.
      const tabs = page.locator('[data-testid^="category-tab-"]');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        // R4-STEP2: `option-grid` (non il ruolo radiogroup) — le categorie
        // kind=image sono griglie di OptionCard senza alcun ruolo ARIA di
        // gruppo (configurator-client.tsx CategoryLane), quindi contarne
        // uno per tab assumendo il ruolo radiogroup andava a vuoto su quel
        // kind. `button` prende il primo controllo di entrambi i kind.
        const group = page
          .getByTestId("details-step")
          .getByTestId("option-grid")
          .filter({ visible: true });
        const buttons = group.locator("button");
        const count = await buttons.count();
        await buttons.nth(Math.min(2 + i, count - 1)).click();
      }
    } else {
      const groups = page.getByTestId("details-step").getByTestId("option-grid");
      const n = await groups.count();
      for (let i = 0; i < n; i++) {
        const buttons = groups.nth(i).locator("button");
        const count = await buttons.count();
        await buttons.nth(Math.min(2 + i, count - 1)).click();
      }
    }
    await page.waitForTimeout(900); // layer paint
    await page.screenshot({ path: `${OUT2}/f02-${width}.png`, fullPage: true });
  }
});

const OUT_R4 = "docs/evidence/r4-step2-restyle";

/**
 * R4-RESTYLE — evidenza cliente del restyle step 2 mobile (sketch 2026-08-28)
 * e delle rifiniture della scheda prodotto step 3.
 *   step2-<locale>-390-top       ordine dei blocchi: descrizione → canvas →
 *                                didascalia → Inspirasjonsbilder → «Konfigurer
 *                                ditt design» → pannello
 *   step2-<locale>-390-scrolled  il canvas è ancora lì: sticky sotto l'header
 *   step2-<locale>-390-lightbox  tap su una foto → PhotoLightbox condiviso
 *   step3-sheet-<locale>-390     ✕ di contrasto, testi neri, nessun trattino
 */
test("R4-RESTYLE: step 2 @390 NO/EN + scheda prodotto step 3", async ({ page }) => {
  mkdirSync(OUT_R4, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });

  // Serve un design con foto REALI, altrimenti la sezione non esiste (by
  // design). Lo si cerca guardando la PAGINA, non la tabella `design_images`:
  // ciò che conta è che il configuratore renda davvero la sezione.
  let slug = "";
  for (const candidate of await activeDesignSlugs()) {
    await page.goto(`/no/configurator?design=${candidate}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    if ((await page.getByTestId("step2-inspiration").count()) > 0) {
      slug = candidate;
      break;
    }
  }
  test.skip(slug === "", "nessun design attivo con foto reali in catalogo");

  for (const locale of ["no", "en"] as const) {
    await page.goto(`/${locale}/configurator?design=${slug}&step=2`);
    await page.getByTestId("details-step").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_R4}/step2-${locale}-390-top.png`, fullPage: true });

    await page.getByTestId("step-nav-flow").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_R4}/step2-${locale}-390-scrolled.png` });

    await page.getByTestId("step2-inspiration").scrollIntoViewIfNeeded();
    await page.getByTestId("step2-inspiration").getByTestId("design-photo").first().click();
    await page.getByTestId("design-photo-lightbox").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_R4}/step2-${locale}-390-lightbox.png` });
    await page.keyboard.press("Escape");
  }

  for (const locale of ["no", "en"] as const) {
    await page.goto(`/${locale}/configurator?design=${slug}&step=3`);
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await ceramicCards(page).first().click();
    await page.getByTestId("product-sheet").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_R4}/step3-sheet-${locale}-390.png` });
    await page.keyboard.press("Escape");
  }
});

const OUT_POLISH = "docs/evidence/r4-polish";

/**
 * R4-POLISH — un file per criterio d'accettazione della card. `docs/evidence`
 * è gitignorato: le immagini vanno in PR a mano, mai `git add -f`.
 */
test("R4-POLISH: CA1..CA6 @390 NO/EN", async ({ page }) => {
  // DIPENDENZA DAI DATI VIVI (richiesta TL 28/8): `amalfi-dyr` per la corsia a
  // immagine più lunga (14 animali, con nomi lunghi come KrabbeAmalfi),
  // `krabbe` perché HA note+figura+sync, `striper` perché NON ne ha nessuno. Se
  // l'admin li edita, questa cattura sbaglia bersaglio: è un dato, non il codice.
  test.skip(!CAN_SEED, "MK_E2E_SEED=1 richiesto: la cattura semina un design «Tekst»");
  mkdirSync(OUT_POLISH, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const { slug: tekst } = await seedTextGroupDesign();
  try {
    for (const locale of ["no", "en"] as const) {
      await page.goto(`/${locale}/configurator?design=amalfi-dyr&step=2`);
      await page.getByTestId("details-step").waitFor({ state: "visible" });
      // A 390×844 l'heading entra già nei primi 844px (bottom ~542 su "no"),
      // quindi questo scrollIntoView è quasi sempre un no-op: la pagina non si
      // sposta e scrollY resta 0. Documentato apposta — è la causa della
      // duplicazione con CA6 più sotto, non un bug da "correggere" nascondendolo.
      await page.getByTestId("step2-configure-heading").scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const dyrLane = page.getByTestId("option-grid").filter({ visible: true }).first();
      // CA5 — freccia destra a inizio corsa, sinistra dopo lo scroll
      await page.screenshot({ path: `${OUT_POLISH}/ca5-lane-arrow-start-${locale}-390.png` });
      await page.getByTestId("option-lane-next").filter({ visible: true }).click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT_POLISH}/ca5-lane-arrow-scrolled-${locale}-390.png` });
      // CA1 — stessa corsia, stesso scroll (un click basta a portare in vista
      // «KrabbeAmalfi», l'unico nome che eccede la card): la ragione di
      // riusare questo stato resta valida (la vecchia CA1 non scrollava mai la
      // corsia e mostrava solo nomi corti). Il ritaglio però è SOLO sulla
      // corsia — non l'intera viewport come ca5-scrolled — così l'ellissi e il
      // contenimento dell'icona nella tile sono il soggetto del fotogramma, e
      // il file è un'immagine realmente diversa (dimensioni diverse), non lo
      // stesso PNG di ca5-scrolled con un altro nome.
      await dyrLane.screenshot({ path: `${OUT_POLISH}/ca1-dyr-lane-${locale}-390.png` });

      // CA2 — «No color» e «Tekst 1»
      await page.goto(`/${locale}/configurator?design=${tekst}&step=2`);
      await page.getByTestId("details-step").waitFor({ state: "visible" });
      const tabs = page
        .getByTestId("category-tabs")
        .locator("button[data-testid^='category-tab-']");
      const i = (await tabs.allTextContents()).findIndex((l) => /^(tekst|text)/i.test(l.trim()));
      await tabs.nth(i).click();
      await page.getByTestId("step2-configure-heading").scrollIntoViewIfNeeded();
      const lane = page.getByTestId("option-grid").filter({ visible: true }).first();
      await lane.locator("> *").first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT_POLISH}/ca2-tekst-nocolor-${locale}-390.png` });
      await lane.locator("> *").nth(1).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT_POLISH}/ca2-tekst-selected-${locale}-390.png` });

      // CA3 — tab presente (krabbe) / assente (striper) / niente residui sotto
      await page.goto(`/${locale}/configurator?design=krabbe&step=2`);
      await page.getByTestId("details-step").waitFor({ state: "visible" });
      await page.getByTestId("category-tab-wishes").click();
      await page.getByTestId("step2-configure-heading").scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT_POLISH}/ca3-wishes-present-${locale}-390.png` });
      await page.goto(`/${locale}/configurator?design=striper&step=2`);
      await page.getByTestId("details-step").waitFor({ state: "visible" });
      await page.getByTestId("step2-configure-heading").scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT_POLISH}/ca3-wishes-absent-${locale}-390.png` });

      // CA6 — descrizione + didascalia, prime lettere nitide. `amalfi-dyr` non
      // ha una descrizione per-locale (F36: nessun blocco `step2-description`
      // nel DOM per questo design), quindi la vecchia cattura non ha MAI
      // mostrato "la descrizione" — ed era, byte per byte, la stessa
      // schermata di ca5-lane-arrow-start: stesso URL, e lo
      // scrollIntoViewIfNeeded di CA5 sopra è già un no-op (l'heading è dentro
      // i primi 844px), quindi ca5-start parte da scrollY 0 esattamente come
      // questa. Il precedente `window.scrollTo(0,0)` non "resettava" nulla:
      // scrollY era già 0 su entrambe, per questo il reset non cambiava
      // l'esito. `blomster-1` HA una descrizione reale ("Enkle, elegante
      // striper" / la sua traduzione EN); il ritaglio si ferma appena sotto la
      // didascalia, PRIMA della corsia tab del pannello — così la fade
      // legittima della corsia (quella che sulla prima pillola mostra "r
      // (14)") resta fuori dal fotogramma e non è ambigua: qui il soggetto è
      // solo descrizione+didascalia.
      await page.goto(`/${locale}/configurator?design=blomster-1&step=2`);
      await page.getByTestId("details-step").waitFor({ state: "visible" });
      await page.waitForTimeout(400);
      const captionBottom = await page
        .getByTestId("preview-note-mobile")
        .evaluate((el) => el.getBoundingClientRect().bottom);
      await page.screenshot({
        path: `${OUT_POLISH}/ca6-description-caption-${locale}-390.png`,
        clip: { x: 0, y: 0, width: 390, height: Math.ceil(captionBottom) + 16 },
      });
    }

    // CA4 — le due ✕, stesso ritaglio
    let withPhotos = "";
    for (const s of await activeDesignSlugs()) {
      await page.goto(`/no/configurator?design=${s}&step=2`);
      await page.getByTestId("details-step").waitFor({ state: "visible" });
      if ((await page.getByTestId("step2-inspiration").count()) > 0) { withPhotos = s; break; }
    }
    await page.getByTestId("step2-inspiration").getByTestId("design-photo").first().click();
    await page.getByTestId("design-photo-lightbox").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_POLISH}/ca4-x-lightbox-390.png`, clip: { x: 250, y: 0, width: 140, height: 100 } });
    await page.keyboard.press("Escape");
    await page.goto(`/no/configurator?design=${withPhotos}&step=3`);
    await page.getByTestId("ceramics-step").waitFor({ state: "visible" });
    await ceramicCards(page).first().click();
    await page.getByTestId("product-sheet").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_POLISH}/ca4-x-sheet-390.png`, clip: { x: 250, y: 100, width: 140, height: 100 } });
  } finally {
    await deleteDesignBySlug(tekst);
  }
});
