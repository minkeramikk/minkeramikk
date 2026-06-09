# DELIVERY — flussi utente, kanban e ciclo di sviluppo

Modello di delivery del progetto. Le **fondamenta** (i18n, Supabase, import, design
system → codice) restano in `TODO.md` (fasi 0–1bis): non sono flussi, sono prerequisiti.
Tutto il resto si sviluppa **per flussi utente**, su questa board.

## 1. Il ciclo di ogni flusso

```
Ready ──► In progress ──────────────► In review ──► Done
(AC      (branch flow/fNN-nome:        (PR aperta,   (merge squash,
scritti)  BE → FE → test → evidenza)    review agent)  board aggiornata)
```

1. **AC prima del codice.** L'agente prende la card, rilegge gli AC e li raffina se
   servono (Given/When/Then verificabili); gli AC raffinati finiscono nella descrizione
   della PR come checklist.
2. **Sviluppo** su branch `flow/fNN-nome-breve`: prima il data layer / API, poi la UI.
   Vincoli: AGENTS.md, DESIGN-SYSTEM.md, schema-er.md. Commit piccoli in inglese.
3. **Test nello stesso branch** (mai "dopo"):
   - *unit* (Vitest) per la logica pura: Money, codice configurazione, sync colori, split per fornitore
   - *funzionali* (Playwright) per i flussi con UI: percorso utente completo degli AC
   - *RLS negativi* dove il flusso tocca dati protetti (client anon non deve leggere/scrivere)
4. **Evidenza nella PR**:
   - flussi con UI: screenshot Playwright a **390 / 768 / 1280** (e confronto con la baseline `docs/theme/preview-*.png` dove esiste)
   - flussi solo BE: niente screenshot — output dei test + esempio di richiesta/risposta (o del PDF generato)
5. **La PR si apre SOLO a flusso finito**: AC verdi, test verdi, `lint`+`build` verdi.
   Niente draft PR, niente PR parziali. Titolo: `F NN — nome flusso`. La descrizione
   contiene: AC checklist, evidenza, note su decisioni prese (se toccano gli ADR → ADR nuovo).
6. **Review agent** (vedi §3) commenta sulla PR; l'agente di sviluppo risolve.
   Max 2 giri di review, poi escalation a Daniele. Merge **squash** su `main`.

## 2. Regole kanban (tarate per agenti, non umani)

- **WIP = 1**: un flusso alla volta in In progress. Gli agenti non guadagnano dal
  multitasking, perdono dal contesto spezzato.
- **Card autosufficiente**: un agente nuovo deve poter completare il flusso leggendo
  SOLO la card + i documenti di riferimento. Se mancano informazioni, la card torna
  in Backlog con la domanda annotata — non si "improvvisa in corsa".
- **Refinement just-in-time**: gli AC dettagliati si scrivono quando la card passa in
  Ready, non prima (le card in Backlog hanno scope e AC abbozzati).
- **Definition of Ready**: dipendenze Done · AC abbozzati presenti · dati/migration
  necessari disponibili · nessuna decisione di prodotto aperta.
- **Definition of Done**: AC verdi · test verdi · lint+build verdi · dizionari NO/EN
  allineati · evidenza in PR · PR merged · board e TODO aggiornati.
- **Niente cerimonie**: la "retrospettiva" è il log decisioni negli ADR e le note in PR.
- **Board PM-only (2026-06-08)**: questo file `docs/DELIVERY.md` è gestito SOLO dal TL/PM e
  committato a parte. I branch dei flussi NON lo toccano (come i `PR-*-body.md`): evita il
  balletto di stash/conflitti a ogni merge. Il dev mette stato/evidenza nel `PR-*-body.md`, non qui.
- **Test gated = rischio rot (lezione F07)**: un test che skippa in CI (manca un secret) può
  marcire — l'AC3 di F07 asseriva un elemento inesistente ed era "approved" senza esser mai
  girato. Priorità infra: **wire i secret nella CI** (vedi §4) così questi test girano davvero.

## 3. Review agent

Agente separato (sessione/subagent dedicato) che NON ha scritto il codice. Input: il
diff della PR + questa checklist. Output: commenti sulla PR (o file `review.md` se il
repo non è ancora su GitHub).

Checklist di review, in ordine:
1. **AC**: ogni criterio della checklist è davvero coperto da codice + test? (non "sembra")
2. **Sicurezza**: RLS rispettata, niente service-role nel client, input validati (zod) sulle route, niente segreti nel diff
3. **Schema**: conforme a `docs/adr/schema-er.md`; nessuna colonna/tabella inventata
4. **Design system**: nessun colore hardcoded, componenti e varianti da DESIGN-SYSTEM.md, focus visibile, touch target
5. **i18n**: niente stringhe hardcoded nel pubblico, parità di chiavi NO/EN, route path in inglese
6. **Test**: i test falsificano davvero? (un test che non può fallire non è un test)
7. **Semplicità**: c'è codice che non serve agli AC? Si toglie (YAGNI)

## 4. Prerequisiti della board

- [x] Repo GitHub privato + remote configurato
- [x] CI minima su PR: `lint` + `build` + `test` (GitHub Actions)
- [ ] Primo push di `main` (sblocca la prima run CI)
- [ ] **PRIORITÀ (2026-06-08)** Secrets Supabase + `ADMIN_EMAIL/PASSWORD` nel repo GitHub (progetto di test) così i test gated (RLS, F05 integration, F06 login, F07 ordini) girano in CI invece di skippare — altrimenti marciscono (lezione flake F07)
- [ ] TODO.md fasi 0bis–1bis completate (infra) → poi le prime card passano in Ready

---

## 5. Board

> Stato iniziale: tutto in **Backlog**. Le card passano in Ready quando l'infra è Done
> e gli AC vengono raffinati. Ordine di tiraggio consigliato: F01✅ → F02✅ → F03✅ → F14✅ → F13✅ → F04✅ → F05✅ → F15✅ → F16✅ → F06✅ → F07✅ → F09✅ → F10✅ → F08✅ → F12✅ → F19✅ → F18✅ → **F11a (theme editor)✅** → F11b (mail brandizzate) → INFRA (go-live hardening) → **F20 (doppio prezzo regione + spedizione-soglia + disclaimer — change-order accettato)**. **Tutti i 16 flussi feature DONE.**
> **Ambito accettato 2026-06-09: 2.350 € base** (+ F20 ≈350 €/2 gg come change-order). Hosting: si resta su **Vercel + piani gratuiti** per ora — ADR 0014 (VPS) *rinviato*, macchina dedicata = fallback su intervento. **Fuori ambito / deferred: multicurrency completa (valute diverse+FX), spedizione a peso, macchina dedicata.**
> UX-polish parcheggiate (schedulabili dopo F16 o dopo il back-office, a scelta): **F18** (nav: stepper cliccabile + Next sticky), **F19** (righe carrello ricche: mini-piatto composto + design code di sessione). F17 = ex sticky-preview, assorbita in F15.

### Backlog

> Priorità UX del configuratore (decisa 2026-06-06): F14 e F13 si tirano PRIMA di F05.
> Il configuratore deve essere "bello e fedele all'originale" quando il cliente lo vede,
> anche a costo di posticipare di poco il flusso ordine end-to-end.







---

**F20 · Doppio prezzo per regione (NO/EU) + spedizione-soglia + disclaimer** — FE+BE · dep: F09 [DONE], F03 [DONE], F16 [DONE] · change-order accettato 2026-06-09 (≈2 gg, ~350 €) · rif. **ADR 0015 (scope ristretto)**
Richiesta del cliente dopo l'accettazione: prezzi diversi per regione (in Norvegia si vende a più che in Europa) + spedizione semplice + disclaimer legale nel configuratore. **Solo il "doppio prezzo", niente multicurrency** (decisione 2026-06-09).
- **Doppio prezzo**: selettore regione (Norvegia/Europa) che cambia il **prezzo mostrato**; price book per regione (prezzo per prodotto × regione, gestito dal back-office, riusa il CRUD F09/F10). **Multicurrency RINVIATA**: per ora due livelli di prezzo, **nessun motore valute/FX/formattazione per valuta**. ⚠️ Da confermare col cliente: i prezzi EU restano in kr o vanno mostrati in €? (se €, è multicurrency minima → rivalutare scope).
- **Spedizione**: solo modalità **"gratis sopra una soglia"** (+ eventuale "inclusa"); **niente motore a peso** (rinviato, ADR 0015). Calcolata e mostrata **dal vivo nel carrello**, congelata nello snapshot ordine/email/PDF.
- **Disclaimer nel configuratore**: nessun pagamento, configurazione **non vincolante**, valida **solo dopo il contatto** del negozio (copy NO/EN).
AC abbozzati: (1) selettore regione persistito ri-prezza catalogo + carrello; (2) price book per regione editabile dal back-office; (3) spedizione gratis-sopra-soglia mostrata nel carrello e nello snapshot; (4) disclaimer visibile nel flusso, bilingue; (5) nessuna regressione su carrello/ordine/PDF. Test: unit (regione → prezzo corretto; soglia spedizione) + Playwright (cambio regione ri-prezza; disclaimer presente NO/EN).
**Out (deferred):** multicurrency completa (valute diverse + FX), spedizione a peso, macchina dedicata.

---

**INFRA · Secret CI + de-flake + hardening go-live** — infra/test · dep: tutti i flussi feature [DONE]
Mette **suite e deploy in sicurezza prima del go-live** (deprioritizzato dopo F19, ma da fare
prima del lancio). 1) **Secret CI**: secret Supabase di test + `ADMIN_EMAIL/PASSWORD` in GitHub
Actions → i test gated (RLS, F05/F06/F07/F09/F10) **girano** invece di skippare. 2) **De-flake**
f14/f15 (race con la preview sticky, come F07). 3) **Fail-closed prod** (ADR 0013): senza
`TURNSTILE_SECRET_KEY`/`RESEND_API_KEY` in `NODE_ENV=production` → errore esplicito, mai
fallback. 4) **AGENTS.md**: regola "merge da terminale pulito, IDE off" + DoD `npm ci`+e2e.
AC: gated girano in CI e verdi; f14/f15 stabili (3 run); build prod fallisce se mancano le key in
produzione; AGENTS.md aggiornato. Metà è GitHub settings (Daniele), il resto è codice.

---

**F11b · Mail HTML brandizzate che seguono il tema (back-office)** — FE+BE · dep: F05 [DONE], F08 [DONE], **F11a [DONE]**
> **11a (theme editor) = DONE** (mergiato 2026-06-09, vedi sezione Done + ADR 0008 note F11a). Questa card è ora **solo 11b**. Gli AC sotto: 1–2 erano di 11a (fatti), 3–5 sono 11b.

**11b — Mail HTML brandizzate che seguono il tema** (riferimento: `docs/preview/07-order-email.html`):
- Convertire da **testo → HTML** TUTTE le mail (deciso): conferma cliente + notifica admin (F05) + email col PDF al fornitore (F08, con allegato).
- **Email-safe**: layout a **tabelle + stili inline**, NIENTE CSS variables (Gmail/Outlook le strippano) → i 3 token si leggono da `settings` all'invio e si **inline-ano come hex letterali** ⇒ cambi il tema nell'editor e le mail successive cambiano colore. **Multipart**: tieni la text/plain attuale come fallback.
- Locale cliente = `orders.locale` (NO/EN); design come il mockup (testata prugna=dark, codice ordine viola=accent, nota "su misura").

AC (definitivi, 2026-06-08):
1. `/admin/theme`: 3 picker + anteprima live; cambio un token e salvo → il sito riflette al refresh; reset ai default.
2. Check AA **bloccante**: coppia sotto AA → blocco con spiegazione+suggerimento; sopra AA → salva.
3. Le 3 mail sono HTML brandizzato (tabelle+inline, multipart con text fallback), design di `07-order-email.html`; conferma cliente nella sua locale.
4. Le mail **seguono il tema**: colore dai `settings` correnti, inline-ato all'invio → cambio tema ⇒ mail successive col nuovo colore (verificabile: l'HTML contiene l'hex corrente).
5. Sicurezza: mutazione tema authenticated (RLS), service-role mai nel client; nessun invio reale in CI (transport mock).
Test: unit (contrasto AA casi limite; render template email coi token → HTML contiene gli hex; multipart text+html) · Playwright (salva tema → CSS variable cambia sul pubblico; AA-fail → blocco) · invio mockato delle 3 mail (con/senza tema cambiato).
Evidenza PR: editor + anteprima + blocco AA; le 3 mail renderizzate con un tema, e una seconda render con tema cambiato (colore diverso).
**Nota scope**: 11b (3 template email + theming) è il pezzo più grosso. Se troppo per una PR, **spacchettare 11a** (editor) **e 11b** (mail) — escalare al TL.

### Ready

**F18 · Navigazione step: stepper cliccabile + Next/Back sticky** — FE · dep: F14 [DONE], F15 [DONE]
Direzione **B+C** (decisa 2026-06-08). Problema: con le griglie verticali lunghe (F15) la CTA
"Next" in fondo finisce sotto la piega → si scrolla per avanzare. Due mosse: stepper navigabile +
Next/Back sempre a vista.

Ciclo UI/UX:
1. **Stepper cliccabile** (DESIGN-SYSTEM §3.8, da statico a interattivo): i pallini 1·2·3 navigano
   allo step mantenendo design+opzioni nell'URL. **Tutti e 3 sempre raggiungibili** (c'è sempre un
   design di default) → niente gate; `aria-current` sullo step attivo, navigabile da tastiera.
2. **Next/Back sticky**, sempre raggiungibili senza scrollare in fondo:
   - **Desktop**: sotto la **colonna sticky** della preview (preview + ConfigCodeBar di F19 + Next/Back).
   - **Mobile**: **barra sticky in basso** (decisa) col Next/Back, pollice-friendly; la preview resta
     pinnata/collassata in alto (F15).
3. **Back dedicato + stepper** (deciso): un Back a un tocco per il passo precedente, più lo stepper
   per i salti liberi. NIENTE nav solo-hover (touch/a11y).

AC (definitivi, 2026-06-08):
1. Stepper: ogni step cliccabile, naviga mantenendo la config (URL); `aria-current` corretto; navigabile da tastiera.
2. Next/Back sempre visibili senza scrollare in fondo — **desktop** sotto la preview sticky, **mobile** in barra sticky in basso; touch ≥44px.
3. Back dedicato (passo precedente) accanto al Next; coesiste con lo stepper.
4. Nessuna regressione: avanzamento/indietro, config code, carrello/drawer, preview sticky/collapse (F15), ConfigCodeBar (F19).
5. `prefers-reduced-motion` rispettato.
Test: Playwright (salto via stepper mantiene la config; Next/Back raggiungibili senza scroll; barra mobile in basso a 390, colonna sotto-preview a 1280; tastiera sullo stepper) a 390/1280.

### In progress
*(vuota)*

### In review
*(vuota)*

### Done

**F11a · Theme editor (colori del sito)** — merged (squash) il 2026-06-09 (branch `flow/f11a-theme-editor`, a4f6a8e + fix 7e1a537). `/admin/theme`: 3 color picker (light/dark/accent) + **anteprima live** (override `--mk-*` su container → token derivati ricalcolati via `color-mix`) + reset ai default. **Gate WCAG AA bloccante** su 3 coppie — text (dark/light), accent (primary-foreground su accent), muted (muted-foreground su **background**): sotto 4.5 → Save disabilitato con spiegazione+hint. `theme-contrast.ts` replica le derivazioni di `globals.css` (92%/38% **allineate** → controlla i colori reali); boundary test falsificabili su tutte e 3. `getThemeTokens` da **stub → legge `settings`** (il pubblico si ri-tematizza al refresh); salvataggio = server action **authenticated** (RLS, zod, service-role mai nel client, **re-check AA server-side**, revalidate layout). 149 unit + e2e f11a; build+e2e verdi in locale (Node 24). **Review: approved** — ratificata la coppia (c) su background (muted-su-muted = 4.06 sul default → consapevolmente **non gated**; hint dell'editor portato a `text-foreground`), documentata in **ADR 0008** (note F11a). 11b (mail brandizzate) resta card separata in Backlog.

**F19 · Righe carrello ricche + design code di sessione** — merged (squash) il 2026-06-08 (a0967c7). Riga carrello: **mini-piatto composto** (pattern-only, img+multiply, no server) + ceramica come immagine separata sotto, da campo additivo `layers`/`plateImage` su `cart.ts` (opzionale → retro-compat al chip-hex, niente migration, niente leak nell'ordine); risolto all'add-time alla width della preview grande (cache-hit). **Codici di sessione**: ConfigCodeBar spostata nella colonna sticky (tolta da step 2/3), ogni riga del drawer col suo codice + "riapri", e deep-link `?code=` decode-once (riusa codec F04, fa funzionare anche i link condivisi). Testid F04 preservati → nessuna regressione. 140 unit (4 nuovi cart) + e2e F19. Review: **approved al primo giro**. Iterazione UI: mini solo-pattern (centro pulito, come step 1-2) dopo che il pozzetto del piatto traspariva.

**F12 · Pagine legali + footer + menu mobile** — merged (squash) il 2026-06-08 (254c867). Pagine `/[locale]/terms` e `/[locale]/privacy` (path inglese, regola i18n) coi testi da `legal.*` (NO live + EN bozza `_review`); `LegalArticle` rende il body in prosa; footer aggiornato ai path inglesi; **menu mobile** (hamburger → `shadcn Sheet` ink, focus-trap/Esc da Radix). Nuovo **`messages.test.ts`**: parità chiavi i18n NO↔EN (esclude `_review`) — guard riusabile per tutto l'i18n futuro. 136 unit + e2e smoke NO/EN a 390/1280. Review: **approved al primo giro**. Go-live TODO: finalizzare copy legale EN (il cliente valida).

**F08 · PDF laboratorio + invio per fornitore** — merged (squash) il 2026-06-08 (ee235f5). PDF "production order" **in inglese, uno per fornitore** (split ADR 0007, `splitBySupplier`), design `06-lab-pdf.html`. Content model puro **senza PII** (snapshot-testato), anteprima piatto composta server-side (**sharp** multiply, decode F04→layers, degrada con grazia), render **@react-pdf** (no puppeteer), invio Resend opzionale (skip+warning se fornitore senza email). Route `GET /api/admin/orders/[id]/pdf` con **self-guard 401** (vincolo F06 "/api self-guard"). e2e + unit + PDF di esempio. Review: **approved al primo giro**. **+ Bonus fix**: `public.ts` client anon session-less per i read pubblici → risolve il **429 storm** (refresh JWT admin a ogni lettura pubblica).

**F10 · Gestione asset configuratore (back-office)** — merged (squash) il 2026-06-08 (df64a8c). CRUD annidato **designs → categorie → opzioni** (split F10a/F10b sullo stesso branch). Passo 0: migration **0009** anti-dup (unique parziale `(category_id,hex) WHERE hex NOT NULL` + `(category_id,name)`, 0 dup verificati). Code via `assign-codes.ts` **condiviso** (estratto da F04, mai ricalcola → `config_code` ordini stabili); anti-dup intercetta `23505`→messaggi distinti hex/nome; **image-or-hex** (ADR 0012) app + CHECK `23514`; upload validato col path convention; **gate `active`** (bozza invisibile nel configuratore). Tutto authenticated (RLS, **service-role mai nel client**), zod. 123 unit + Playwright F10 6/6 (RLS, create→code→activate→configuratore + draft nascosto, dup rifiutato, image-or-hex). Review: **approved al primo giro**. Coda flaky e2e pre-esistenti (f14/f15, configuratore byte-identico) → de-flake separato. **Board non toccato dal dev (regola PM-only rispettata).**

**F09 · CRUD prodotti + fornitori (back-office)** — merged (squash) il 2026-06-08 (246859a). CRUD products + suppliers sotto `/admin` via server-action **cookie-session (RLS authenticated, service-role mai nel client)**, zod su ogni form. Prezzo kr→cents a **matematica intera** (`parsePriceToCents`: niente float, virgola/punto/spazi/NBSP, rifiuta ambiguità/negativi/>2 decimali, 14 unit); slug stabile (mantenuto in edit, generato+dedup in create); image upload validata su Storage; `supplier_id` obbligatorio (ADR 0007). **Delete RESTRICT** fornitore (`23503` → "disattiva invece"). Riflesso live nello step 3 (force-dynamic). 110 unit + Playwright F09 4/4 + RLS-negativo. Review: **approved al primo giro**. Note non bloccanti: image salvata sempre con path `.png` (cosmetico, contentType corretto); delete prodotto in realtà non bloccato dagli ordini (`order_items.product_id` SET NULL, snapshot sopravvive). Coda: flake F07 AC3 pre-esistente → fix in `fix/f07-status-test-flake` (test-only).

**F07 · Gestione ordini (back-office)** — merged (squash) il 2026-06-08 (d1d0b46). Lista su `/admin` (KPI nuovi/da-contattare/in-produzione/valore-aperto, filtri stato+fornitore+ricerca testo/code, tabella desktop + card mobile §3.5, badge soft §3.3) + dettaglio `/admin/orders/[id]` (split per fornitore ADR 0007, config-code cliccabile → configuratore **nella locale dell'ordine** via decode F04, cambio stato + note interne via server-action). Tutto via `createClient()` cookie-session (RLS authenticated, **service-role mai**), zod sulle mutazioni, `updated_at` da trigger. Core dati puro 13 unit (su 101) + Playwright F07 (lista/KPI, filtro, ricerca code, stato persiste+rilegge, note, config-code→configuratore, mobile). Review: **approved al primo giro**. Note: lista tenuta su `/admin` (no churn F06); filtri in JS lato server (ok per il volume; indice `config_code` pronto per spingerli in SQL se crescono).

**F06 · Login back-office + AdminShell** — merged (squash) il 2026-06-08 (83c7f0c). Guardia nel middleware su tutte le `/admin/*` con `getUser()` (JWT validato dal server, non `getSession()`) e **solo anon key**; decisione di redirect pura unit-testata (anon→`/admin/login` 307, authed su login→dashboard). Login server-action con **errore generico** (no user-enumeration), sessione cookie SSR persistente. Seed admin idempotente (service-role solo nello script, password da `.env.local`, no signup pubblico). AdminShell §3.6/§4 (sidebar ink + topbar + logout + drawer mobile, tema viola). 88 unit (guard puro) + Playwright F06 11 incl. **negativo `request.get('/admin')`→307, nessun HTML admin** + regressione pubblica. Review: **approved al primo giro**. Vincolo forward: il matcher esclude `/api` → eventuali `/api/admin/*` futuri devono auto-proteggersi. Incluso chore: gitignore PR-body usa-e-getta. ADR 0013 reminder go-live (Turnstile/Resend fail-closed prod).

**F16 · Carrello persistente: drawer da header** — merged (squash) il 2026-06-08 (6fd2a83). `CartProvider` chiama `useCart` una volta e lo condivide via context (badge/drawer/step-3 in sync nella stessa tab — gli `storage` event non scattano same-tab); scope view-only, `cart.ts` intatto. Header CartButton + badge (hydration-gated, niente flash SSR) su ogni step; `shadcn Sheet` (focus-trap/Esc/restore da Radix) a destra/full-mobile; due fasi carrello↔checkout (order-form F05 dentro il drawer). Righe: chip-hex + qty stepper (44px touch mobile, sm:36px) + rimuovi + subtotale Money; empty state; totale; CTA. 84 unit + Playwright F16 (badge cross-step, edit/rimuovi, checkout, empty, mobile full-height) + F03/F05 adattati. Review: **approved al primo giro**. Sign-off: thumbnail = chip-hex (cart.ts congelato; mini-piatto composto → F19); SupplierBadge tolto dalla riga (scelta proprietario). Build prod + e2e screenshot in locale (Node 24).

**F15 · Step 2 identico all'originale + tema copycat** — merged (squash) il 2026-06-08 (2b9364c). Griglia verticale a capo (carosello embla rimosso); swatch = **foto-glassa reale** (`options.image` dalle `palettes`, backfill idempotente: 21 swatch dedup per hex → 261 opzioni), grana procedurale F13 = fallback, flat hex ultimo; icone animali = **arte originale su tile** (`--muted`/`--primary`), niente `mask-image`. **Ex-F17 assorbita**: preview sticky su desktop / collapse-a-thumbnail su mobile mentre la lista scorre (reduced-motion ok). **Tema base "copycat"** (rosa `#fbe9e4` / prugna `#2b2330` / viola `#7d4f9c`): 3 token in globals/theme.ts + migration **0008** `update settings` che ri-tematizza il sito running. CHECK già rilassato in 0005. 84 unit + Playwright (griglia/no-scroll-x/asset reali/sticky/collapse) + e2e F13 aggiornati alla realtà F15. Review: **approved al primo giro**. Promemoria: serve `supabase db push` per applicare la 0008. ADR 0012 (swatch image) + 0013 (deploy email/anti-bot) in main.

**F05 · Invio ordine** — merged (squash) il 2026-06-08 (53f0e59). `create_order` SECURITY DEFINER atomico (search_path bloccato, eseguibile solo dal service_role, anon revocato — più sicuro dell'insert-anon dell'AC: niente bypass di Turnstile); sequence `order_seq` START 1001 concorrenza-safe (integration test con submit paralleli → codici distinti). API server-only (zod condiviso client/server, Turnstile verificato col secret, service-role mai nel bundle), email Resend locale-aware + transport iniettabile + resiliente (email non blocca l'ordine), carrello svuotato su successo / preservato su errore. 77 unit + integration + Playwright 33 desktop + mobile. Review: **approved al primo giro**. Hardening annotati (non bloccanti): snapshot fidati dal client (ok per finto e-commerce, ri-derivare se mai pagamento reale); Turnstile fail-closed in prod se manca la key. Il branch ha portato in main anche **ADR 0012 + schema + card F15**.

**F04 · Codice configurazione: salva / carica / condividi** — merged (squash) il 2026-06-06 (ADR 0011). Migration additiva 0006 (`designs.code` UNIQUE, `options.code` UNIQUE per categoria, no reset); backfill idempotente via UPDATE puri (id stabili per ordini): 6 code design + 277 code opzioni, 0 NULL/ambigui/dup, re-run 0/0; import ora chiama `assignMissingCodes`. Codec puro `config-code.ts` (encode ordinato per slug, decode tollerante mai-crash, alfabeto 31 simboli). UI `ConfigCodeBar` (copia codice/link + incolla) in step 2/3. **AC5**: step 3 produce ora il codice canonico (`encodeConfigCode`), non più la query-string interim di F03 → un solo formato per F05/F08. 63 unit (round-trip property-based 600 seeded) + 30 e2e. Review: **approved al primo giro**. Nota: design code single-char sequenziali (A–F), mnemonici via admin in futuro.

**F13 · Step 2 stile originale: opzioni con icona + preview-on-hover del pattern** — merged (squash) il 2026-06-06. Swatch glassa = `hex` + due overlay `feTurbulence` condivisi (grana multiply 0.45 + screziato bianco screen 0.9), zero asset, schema invariato; icone kind=image come sagoma monocromatica `mask-image` + `currentColor` (ink/bianco per stato card) — verificato asset RGBA alpha pulito, niente STOP; popup hover/focus col `layer_image` in portal su `document.body` (no clipping embla, no layout shift, Esc, soppresso su touch); AC6 radiogroup roving tabindex + frecce/Home/End. 7 AC Playwright (desktop+mobile su device Pixel 5 reale) + regressioni F01–F04/F14 = 25 e2e verdi; 51 unit; parità i18n. Review: **approved al primo giro**. Note minori non bloccanti annotate (kind=image non in radiogroup, popup non segue scroll, no aria-describedby).

**F14 · Empty-state continuo: preview sempre composta, transizione step invisibile** — merged (squash) il 2026-06-06. Refactor: step 1+2 unificati in `configurator-client.tsx` (PreviewCanvas montata una volta, mai rismontata → step1→2 pixel-identico), step 3 resta layout server separato; default `designs[0]` risolto SSR + `ReactDOM.preload` priorità alta (primo paint = piatto composto, niente buco bianco); PreviewCanvas riscritta a state-machine keyed-on-content con cross-fade commit-after-fade (fix bug layer stale impilati). Test F14 falsificabili (HTML SSR senza skeleton, pixel-diff step change, polling no-blank + regression stale) a 390/1280; F01/F02 adattati al nuovo DOM senza annacquarli (F01 AC "CTA disabilitata" superato by design: niente più empty state). Review: **approved al primo giro**.

**F03 · Scelta ceramica + carrello (step 3)** — merged (squash) il 2026-06-06 (PR #3, [8a32f19](https://github.com/danieledangeli/minkeramikk/commit/8a32f198f6a335ada784e4e981ae1abb17c69e09)). Step 3 prodotti del solo fornitore agganciato (RLS anon), carrello multi-item con Money VO (cents, no float, no cross-currency), persistenza localStorage + sync cross-tab. 51 unit + Playwright + RLS. Review: **approved al primo giro**. Coda CI: drift lockfile preesistente da PR #2 (`@swc/helpers`, Node 26 non-LTS vs CI Node 22) risolto pinnando **Node 24 LTS** come fonte unica (`engines.node` + `.nvmrc` + CI `node-version-file`, commit [582fdf0](https://github.com/danieledangeli/minkeramikk/commit/582fdf0)) — sanato anche il rosso di main. Da recepire in AGENTS.md: `npm ci` (non `install`) nella DoD locale + `.nvmrc` unica fonte versione Node.

**F02 · Personalizzazione design** — merged il 2026-06-06 (PR #2): compositing layer (multiply; animal-shape normal in cima), lock colori per hex sui 4 casi, preview composta da step 1 (AC7), fix margine bordi. 40 unit + Playwright. Review: approved al primo giro.

**F01 · Scelta design** — merged (squash) il 2026-06-06. PR "F01 — Design selection": migration 0004 (ADR 0009), data layer anon, reducer, URL state, 28 unit + Playwright 390/1280. Review: approved al primo giro.

