# TODO — minkeramikk.no

Backlog operativo. Regole: prendere il primo task non spuntato della fase corrente,
completarlo secondo la Definition of Done in `AGENTS.md`, spuntarlo. Task scoperti in
corso d'opera si aggiungono qui, non si fanno "al volo". Le fasi 3+ sono macro e vanno
dettagliate (come fase 0–2) prima di iniziarle.

## Fase 0 — Fondamenta i18n *(da fare per prima: tutto il resto ci si appoggia)*

- [x] 0.1 Installare `next-intl`; creare `src/i18n/` con `routing.ts` (locales `no`/`en`, default `no`), `request.ts` e `middleware.ts` *(nota: il middleware sta in `src/middleware.ts`, posizione obbligata di Next; in `src/i18n/` ci sono routing, request e navigation)*
- [x] 0.2 Creare dizionari `src/i18n/messages/no.json` e `en.json` con le chiavi di header/footer esistenti
- [x] 0.3 Migrare le route pubbliche sotto `src/app/[locale]/(public)/…` (bygg-din-design, produkter, home); `/admin` e `/api` restano fuori
- [x] 0.4 Sostituire le stringhe hardcoded in `site-header.tsx` e `site-footer.tsx` con `t()`; aggiungere switch lingua NO/EN nell'header *(internazionalizzati anche hero, how-it-works, design-showcase, product-card e le pagine pubbliche: regola i18n n.3)*
- [x] 0.5 Redirect `/` → `/no` (307 via middleware); build, lint e parità chiavi ok; `/no`, `/en`, `/admin` verificati con next start
- [x] 0.6 Recuperare i testi norvegesi dal sito live (home, configuratore, form ordine, kjøpsvilkår da `/kjpsvilkar`, personopplysninger) e popolare `no.json`; bozza inglese in `en.json` marcata `_review`

### Fase 0-bis — Specifiche post-accettazione (2026-06-05, ADR 0007/0008)

- [x] 0.7 Rinominare le route in inglese: `bygg-din-design` → `configurator`, `produkter` → `products`; la root `/[locale]` punta al configuratore (niente landing: la gestisce il cliente altrove con CTA verso il sito)
- [x] 0.8 Rimuovere/ridurre la home marketing attuale (hero, how-it-works…): restano configuratore, prodotti e pagine di servizio

### Task scoperti in fase 0 (per fasi successive)

- [ ] (fase 1) Le descrizioni dei 6 design sono hardcoded in `lib/data.ts`: spostarle nelle colonne `_no`/`_en` della tabella designs
- [ ] (fase 5) Creare pagine `/[locale]/personopplysninger` e `/[locale]/kjopsvilkar` usando `legal.*` già nei dizionari (footer le linka già)
- [ ] (fase 5) Header: menu mobile (hamburger) — la nav attuale è solo desktop

## Fase 1 — Dati: Supabase + import del catalogo esistente

- [ ] 1.0 Snapshot del code block legacy in `docs/legacy/configurator-squarespace.html` (immutabile, `curl https://www.minkeramikk.no/bygg-din-design-1`) + nota di mappatura funzioni
- [ ] 1.1 Setup Supabase, riproducibile da CLI (niente click sul dashboard per ciò che può stare in git):
  - progetto su regione **EU** (clienti norvegesi → GDPR/latenza, es. `eu-north-1`)
  - `supabase init` nel repo: migrations versionate in `supabase/migrations/*.sql`, `supabase start` per il DB locale di sviluppo
  - `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo server, mai esposta) — committare `.env.example` coi nomi senza valori
  - client con `@supabase/ssr`: `src/lib/supabase/server.ts` (server components/route handlers) e `browser.ts`; il service role SOLO in codice server
  - script npm `db:types`: `supabase gen types typescript` → `src/lib/supabase/types.ts` (rigenerare a ogni migration; i tipi generati non si modificano a mano)
  - utente admin di sviluppo via seed; quello del cliente si crea all'handover
- [ ] 1.2 Prima migration (`supabase/migrations/0001_schema.sql`) con lo schema di `docs/adr/schema-er.md` (ADR 0004–0008): naming inglese, CHECK su kind/image/hex, enum `order_status`, suppliers con designs/products.supplier_id NOT NULL, tabella settings (3 token tema), indici, trigger `updated_at`; verificare con `supabase db reset` e rigenerare i tipi (`db:types`)
- [x] 1.2b Value object `Money` in `src/lib/money/` (somma, moltiplicazione, formattazione Intl per locale) con unit test — vedi ADR 0005
- [ ] 1.3 Migration RLS (`0002_rls.sql`): RLS attiva su TUTTE le tabelle; catalogo in lettura pubblica (solo righe `active`/`visible`), scrittura authenticated; orders/order_items insert pubblico + select/update authenticated; suppliers solo authenticated. Test negativi con client anon (non deve leggere ordini né suppliers)
- [ ] 1.4 Bucket Storage `assets` pubblico in lettura (layer, prodotti), creato via migration; convenzione path `designs/{slug}/{category}/{file}.png` e `products/{slug}.png`; resize on-the-fly con render/image transform (niente varianti pre-generate)
- [ ] 1.5 Script `scripts/import-squarespace.ts`: legge le ~20 raccolte del sito live (`/plates`, `/palettes`, `/animals-*`, `/floreal*`, `/crab*`, `/juletre*`, `/stripes`, `/hovering-colors`), estrae nome/prezzo/hex dai filename (prezzi → cents), scarica i PNG, popola DB + Storage; le raccolte colori diventano options con hex della rispettiva categoria (kind=color). Idempotente (rilanciabile senza duplicati)
- [ ] 1.6 Eseguire l'import e validare i conteggi: 8 prodotti, 21 colori Blomster + raccolte colori per categoria, 6 design con tutte le categorie e layer_slot assegnati; report scritto in `scripts/import-report.md`

## Fase 1-bis — Fondamenta UI (design system → codice)

- [x] 1.7 Portare `../docs/theme/tokens.css` in `globals.css` + `@theme inline`; Poppins via `next/font`; iniezione dei 3 token da `settings` nel layout server (un solo punto)
- [ ] 1.8 Installare i componenti shadcn (button, card, badge, input, select, table, sheet, dialog) e creare le shell `PublicShell`/`AdminShell` + componenti di dominio (Stepper, OptionCard, Swatch, PreviewCanvas, SupplierBadge) come da `DESIGN-SYSTEM.md` §3-4; verifica screenshot vs baseline `preview-*.png`

## Dalle fasi ai flussi

Da qui in poi lo sviluppo procede **per flussi utente** sulla board kanban di
`docs/DELIVERY.md` (F01–F12), col ciclo AC → dev → test → PR → review agent.
Le fasi sotto restano come riferimento dei contenuti, ma la fonte operativa è la board.

## Fase 2 — Configuratore (porting della logica esistente) → board F01–F04

- [ ] 2.1 Estrarre dallo snapshot legacy (task 1.0) le funzioni riusabili (`getPreviewImagesForCode`, `syncColors`, `generateCodeString`) in `src/lib/configurator/` come moduli TS puri con unit test; formato codice nuovo e lock colori via `sync_group` (ADR 0002/0004)
- [ ] 2.2 Componente preview: layer `<img>` sovrapposti + `mix-blend-mode: multiply`, dati dal DB
- [ ] 2.3 Step 1 (scelta design, tutti i fornitori attivi) e navigazione a 3 step con stato URL-friendly; la scelta del design aggancia il fornitore per l'articolo (ADR 0007)
- [ ] 2.4 Step 2 (opzioni dinamiche per categoria, carousel embla, palette)
- [ ] 2.5 Step 3 (ceramiche del SOLO fornitore agganciato, quantità) + carrello multi-item con totale (misto tra fornitori ok), persistito in localStorage
- [ ] 2.6 Salva/carica codice configurazione

## Fase 3 — Ordini (macro, da dettagliare)

Form ordine con Turnstile · `api/orders` con validazione · email Resend (cliente NO/EN + admin) · codice ordine progressivo · **PDF d'ordine per il laboratorio** (in italiano, da `config_snapshot`: quantità, prodotti, colori con nome+hex, anteprima composta server-side con sharp; **uno per fornitore** — split delle righe per supplier, ADR 0007; bottone nel dettaglio ordine + invio opzionale al supplier alla conferma)

## Fase 4 — Back-office (macro, da dettagliare)

Auth Supabase (singolo admin) · spec UI: `../docs/preview/*.html` · ordini con stati e note · CRUD prodotti e fornitori (assegnazione supplier su design e prodotti) · gestione asset/palette con upload e import · **tema: editor dei 3 token con anteprima live e check contrasto WCAG AA bloccante (ADR 0008)**

## Fase 5 — Restyling e rifinitura (macro, da dettagliare)

Design token applicati a tutto il pubblico · mobile-first sui carousel · pagine statiche (kjøpsvilkår, personopplysninger, FAQ)

## Fase 6 — QA e go-live (macro, da dettagliare)

Screenshot Playwright 3 breakpoint × pagine chiave · test E2E flusso ordine · Lighthouse · deploy Vercel + DNS · handover (credenziali, mini-guida back-office)

---

## Decisioni tecniche

Vivono in `docs/adr/` (indice: `docs/adr/README.md`; modello dati: `docs/adr/schema-er.md`).
Punti aperti: nessuno.
