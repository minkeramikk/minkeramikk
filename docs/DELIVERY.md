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
- [ ] Secrets Supabase nel repo GitHub (URL, anon key, service role di un progetto di test) così i test RLS girano in CI invece di essere skippati
- [ ] TODO.md fasi 0bis–1bis completate (infra) → poi le prime card passano in Ready

---

## 5. Board

> Stato iniziale: tutto in **Backlog**. Le card passano in Ready quando l'infra è Done
> e gli AC vengono raffinati. Ordine di tiraggio consigliato: F01✅ → F02✅ → F03✅ → F14✅ → F13✅ → F04✅ → F05✅ → F15✅ → **F16** → F06 → F07 → F09 → F10 → F08 → F11 → F12.
> UX-polish parcheggiate (schedulabili dopo F16 o dopo il back-office, a scelta): **F18** (nav: stepper cliccabile + Next sticky), **F19** (righe carrello ricche: mini-piatto composto + design code di sessione). F17 = ex sticky-preview, assorbita in F15.

### Backlog

> Priorità UX del configuratore (decisa 2026-06-06): F14 e F13 si tirano PRIMA di F05.
> Il configuratore deve essere "bello e fedele all'originale" quando il cliente lo vede,
> anche a costo di posticipare di poco il flusso ordine end-to-end.







---

**F18 · Navigazione step: stepper cliccabile + Next sticky** — FE · dep: F14 [DONE]
Future improvement (direzione 2026-06-08: opzione **B+C**). Problema: con le griglie verticali
lunghe (F15) la CTA "Next" in fondo finisce sotto la piega. Soluzione: rendere la navigazione
sempre raggiungibile + libera.
Ciclo UI/UX:
1. **Stepper cliccabile** (DESIGN-SYSTEM §3.8, da statico a interattivo): i pallini 1·2·3
   navigano allo step mantenendo design+opzioni nell'URL; step non ancora raggiungibili
   (es. step 3 senza design) disabilitati con motivo.
2. **Next/Back sticky** agganciati alla preview sempre visibile (desktop: sotto la colonna
   sticky; mobile: nella zona pin/collapse della preview), raggiungibili senza scrollare.
3. NIENTE navigazione solo-hover (no touch/a11y). aria-current sullo stepper, tastiera, focus.
AC (bozza):
1. Ogni step dello stepper è cliccabile e naviga mantenendo la config (URL); step bloccati disabilitati.
2. Next/Back visibili senza scrollare fino in fondo, a 390 e 1280, touch ≥44px.
3. Nessuna regressione: avanzamento/indietro, config code, carrello, preview sticky.
Test: Playwright (salto via stepper mantiene config; Next/Back raggiungibili senza scroll) a 390/1280.

---

**F19 · Righe carrello ricche + design code di sessione** — FE · dep: F04 [DONE], F16
Future improvement (direzione 2026-06-08). Oggi il box ConfigCodeBar è sepolto nello step 2 e
la riga del carrello mostra solo un chip-hex. F19 rilavora la riga del carrello e riloca il codice.
Due concetti distinti di codice: la **config corrente** e i codici delle **config già nel
carrello** (ogni riga = un design salvato, ha già il suo `config_code`, F04).
Ciclo UI/UX:
1. **Mini-piatto composto nella riga** (sostituisce il chip-hex di F16): thumbnail ~48px che
   rende il piatto composto di quella config, **riusando la tecnica `<img>` impilati +
   `mix-blend-mode: multiply`** della PreviewCanvas (ADR 0002/0010) — nessun compositing
   server. Richiede un **campo additivo sulla cart line** (`layers: {src, recolor}[]`,
   JSON-friendly) salvato all'add-time (step 3 ha già risolto i layer per la preview grande);
   i layer sono già in cache → thumbnail istantanee.
2. **Codici**: vicino alla preview un mini "salva/condividi questo design" (copia codice
   corrente + copia link + incolla→carica), presente in ogni step (rimuove il box dallo
   step 2/3). Nel drawer, ogni riga col suo `config_code` + "copia" + "riapri/modifica"
   (ricarica quella config). Riusa encode/decode F04, niente logica nuova del codice.
AC (bozza):
1. Riga carrello: mini-piatto composto (img+multiply, no server) al posto del chip-hex; campo additivo `layers` sulla cart line, persistito in localStorage (F03 compatibile).
2. Box ConfigCodeBar rimosso dallo step 2/3; affordance compatta vicino alla preview (copia codice/link, incolla→carica) presente in ogni step.
3. Nel drawer, ogni riga col suo codice + copia + "riapri" (apre il configuratore su quella config; decode tollerante F04).
4. Incolla codice valido → ricostruzione; invalido → messaggio gentile (mai crash).
5. Nessuna regressione su F04 (codice canonico per ordine/PDF invariato), F16 (badge/persistenza), né sul carrello.
Test: Playwright (mini-preview presente per una riga reale; copia/incolla da step diversi; riapri una riga → config giusta) a 390/1280; unit `cart.ts` per il nuovo campo `layers` (persist/hydrate).
Nota: meglio **dopo F16** (riusa il drawer); il campo `layers` è l'estensione additiva della cart line lasciata aperta da F16.

---

**F06 · Login back-office + AdminShell** — FE+BE · dep: infra
Scope: `/admin/login` (Supabase Auth, singolo admin), route `/admin/*` protette
(middleware), AdminShell (sidebar, topbar) da DESIGN-SYSTEM §3.6/§4, logout.
AC (bozza):
- Credenziali valide → dashboard ordini; non autenticato su `/admin/*` → redirect a login
- Credenziali errate → errore senza leak di informazioni; sessione persiste al refresh
Test: funzionale login/logout/redirect · verifica che le pagine admin non siano raggiungibili da anon (anche via fetch diretto).

---

**F07 · Gestione ordini (back-office)** — FE+BE · dep: F05, F06
Scope: lista con KPI, ricerca, filtri stato/fornitore (spec: `docs/preview/02-03` +
template back-office); dettaglio con articoli, config code cliccabile (riapre nel
configuratore), cambio stato, note interne; ricerca per `config_code` incollato.
AC (bozza):
- La lista mostra gli ordini più recenti prima, filtrabili per stato e fornitore
- Cambio stato → persiste, `updated_at` aggiornato, badge coerente
- Incollo un config code nella ricerca → trovo l'ordine che lo contiene
Test: funzionale lista+dettaglio+cambio stato · unit query filtri.

---

**F08 · PDF laboratorio + invio per fornitore** — BE only · dep: F07
Scope: alla conferma (o da bottone nel dettaglio), genera PDF in italiano PER OGNI
fornitore coinvolto (split righe, ADR 0007): quantità, prodotti, colori nome+hex+swatch,
anteprima composta server-side (sharp, multiply); invio opzionale via Resend al supplier.
AC (bozza):
- Ordine misto (2 fornitori) → 2 PDF, ognuno con le SOLE righe del suo laboratorio
- Il PDF mostra hex e nome colore per ogni scelta; l'anteprima corrisponde alla config
- Fornitore senza email → PDF generato, invio saltato con warning in UI
Evidenza PR: i PDF generati da un ordine di test (no screenshot UI).
Test: unit split per fornitore · snapshot test sul PDF (contenuto testuale) · integrazione compositing sharp.

---

**F09 · CRUD prodotti + fornitori (back-office)** — FE+BE · dep: F06
Scope: liste e form per products (name/description _no/_en, price con Money, image,
visible, supplier) e suppliers (name, email, phone, notes); spec `docs/preview/04`.
AC (bozza):
- Creo/modifico/nascondo un prodotto → il configuratore step 3 riflette la modifica
- Prezzo inserito in kr → salvato in cents; mai input float ambigui
- Cancello un fornitore con prodotti o design → operazione bloccata (RESTRICT) con messaggio che suggerisce la disattivazione (`active=false`); un fornitore senza catalogo si può cancellare
Test: funzionale CRUD · unit conversione prezzo input→cents.

---

**F10 · Gestione asset configuratore (back-office)** — FE+BE · dep: F06
Scope: designs (con supplier), categorie (kind, layer_slot, sync_group), opzioni
(upload PNG con resize automatico / hex per kind=color); spec `docs/preview/05`;
anteprima con ricolorazione prima di pubblicare.
AC (bozza):
- Carico un PNG su una categoria image → opzione visibile nel configuratore con `active=true`
- Creo un'opzione colore con hex+nome → appare tra gli swatch della categoria
- Upload non-PNG o oversize → rifiutato con messaggio chiaro
Test: funzionale upload→storage→render · unit validazioni.

---

**F11 · Theme editor (back-office)** — FE+BE · dep: F06
Scope: pagina Theme: 3 color picker (light/dark/accent), anteprima live (come il tester
dei template), **check contrasto WCAG AA bloccante** (ADR 0008), salvataggio su `settings`,
iniezione nel layout pubblico.
AC (bozza):
- Cambio accent e salvo → il sito pubblico riflette il colore al refresh successivo
- Coppia di colori sotto AA → salvataggio bloccato con spiegazione e suggerimento
- Reset ai default del tema disponibile
Test: unit funzione di contrasto (casi limite) · funzionale salva→verifica CSS variable sul pubblico.

---

**F12 · Pagine legali + footer** — FE · dep: infra
Scope: `/[locale]/terms` e `/[locale]/privacy` con testi recuperati dal sito live
(kjøpsvilkår, personopplysninger) già nei dizionari; footer con link; menu mobile header.
AC (bozza): pagine raggiungibili dal footer in entrambe le lingue; nessuna chiave i18n mancante.
Test: funzionale smoke su entrambe le lingue.

### Ready

**F16 · Carrello persistente: drawer da header** — FE · dep: F03 [DONE], F05 [DONE]
Sul sito originale il carrello vive lungo tutta la sessione; da noi il dato già persiste
(F03: localStorage + sync cross-tab), ma la VISTA è solo allo step 3. F16 la solleva
nell'header della `PublicShell`, accessibile da ogni step. Pattern scelto (2026-06-08):
**drawer da header** (opzione A) — `shadcn Sheet` già installato.

Ciclo UI/UX:
1. **Header**: `PublicShell` guadagna un bottone carrello con **badge** (conteggio articoli),
   sempre visibile (anche tornando a step 1/2). DESIGN-SYSTEM §3.7 (header) + nuovo §3.12 CartDrawer.
2. **Drawer**: click → pannello che scorre da destra (desktop) / sheet a tutta altezza (mobile,
   `shadcn Sheet`). Lista righe (prodotto, design+config, quantità editabile, rimuovi, subtotale),
   totale (Money), CTA "Send bestilling" → form ordine (F05). Empty state con CTA al configuratore.
3. La logica resta `cart.ts`/`use-cart` (F03): il drawer è solo la vista condivisa. Lo step 3
   mantiene "aggiungi al carrello" (che aggiorna il badge/drawer); il checkout si raggiunge dal
   drawer invece che inline.
4. Focus trap nel drawer (shadcn lo gestisce), Esc chiude, ripristino focus sul bottone.

AC (definitivi, 2026-06-08):
1. Da qualsiasi step il bottone carrello in header mostra il conteggio corrente (badge) e apre il drawer.
2. Drawer: righe con quantità editabile + rimozione (aggiornano totale, badge e localStorage), totale Money corretto (no float, no cross-currency), empty state con CTA al configuratore.
3. CTA del drawer porta al form ordine (F05) col carrello corrente; ordine inviato → carrello svuotato → badge a 0.
4. Persistenza F03 intatta: ricarico/torno a step 1 → carrello e badge invariati; sync cross-tab.
5. Accessibile (focus trap, Esc, aria-label sul bottone + conteggio annunciato) e mobile 390 (sheet a tutta altezza, touch ≥44px).
6. i18n NO/EN su bottone, drawer, empty state, CTA.
Test: Playwright (apri da step 1/2/3, edita qty/rimuovi, vai al checkout, svuota, badge tra gli step) a 390/1280; unit `cart.ts` invariati. Aggiornare gli e2e step-3 che assumevano il carrello inline.
Evidenza PR: drawer aperto desktop+mobile, badge che cambia tra gli step.

### In progress
*(vuota)*

### In review
*(vuota)*

### Done

**F15 · Step 2 identico all'originale + tema copycat** — merged (squash) il 2026-06-08 (2b9364c). Griglia verticale a capo (carosello embla rimosso); swatch = **foto-glassa reale** (`options.image` dalle `palettes`, backfill idempotente: 21 swatch dedup per hex → 261 opzioni), grana procedurale F13 = fallback, flat hex ultimo; icone animali = **arte originale su tile** (`--muted`/`--primary`), niente `mask-image`. **Ex-F17 assorbita**: preview sticky su desktop / collapse-a-thumbnail su mobile mentre la lista scorre (reduced-motion ok). **Tema base "copycat"** (rosa `#fbe9e4` / prugna `#2b2330` / viola `#7d4f9c`): 3 token in globals/theme.ts + migration **0008** `update settings` che ri-tematizza il sito running. CHECK già rilassato in 0005. 84 unit + Playwright (griglia/no-scroll-x/asset reali/sticky/collapse) + e2e F13 aggiornati alla realtà F15. Review: **approved al primo giro**. Promemoria: serve `supabase db push` per applicare la 0008. ADR 0012 (swatch image) + 0013 (deploy email/anti-bot) in main.

**F05 · Invio ordine** — merged (squash) il 2026-06-08 (53f0e59). `create_order` SECURITY DEFINER atomico (search_path bloccato, eseguibile solo dal service_role, anon revocato — più sicuro dell'insert-anon dell'AC: niente bypass di Turnstile); sequence `order_seq` START 1001 concorrenza-safe (integration test con submit paralleli → codici distinti). API server-only (zod condiviso client/server, Turnstile verificato col secret, service-role mai nel bundle), email Resend locale-aware + transport iniettabile + resiliente (email non blocca l'ordine), carrello svuotato su successo / preservato su errore. 77 unit + integration + Playwright 33 desktop + mobile. Review: **approved al primo giro**. Hardening annotati (non bloccanti): snapshot fidati dal client (ok per finto e-commerce, ri-derivare se mai pagamento reale); Turnstile fail-closed in prod se manca la key. Il branch ha portato in main anche **ADR 0012 + schema + card F15**.

**F04 · Codice configurazione: salva / carica / condividi** — merged (squash) il 2026-06-06 (ADR 0011). Migration additiva 0006 (`designs.code` UNIQUE, `options.code` UNIQUE per categoria, no reset); backfill idempotente via UPDATE puri (id stabili per ordini): 6 code design + 277 code opzioni, 0 NULL/ambigui/dup, re-run 0/0; import ora chiama `assignMissingCodes`. Codec puro `config-code.ts` (encode ordinato per slug, decode tollerante mai-crash, alfabeto 31 simboli). UI `ConfigCodeBar` (copia codice/link + incolla) in step 2/3. **AC5**: step 3 produce ora il codice canonico (`encodeConfigCode`), non più la query-string interim di F03 → un solo formato per F05/F08. 63 unit (round-trip property-based 600 seeded) + 30 e2e. Review: **approved al primo giro**. Nota: design code single-char sequenziali (A–F), mnemonici via admin in futuro.

**F13 · Step 2 stile originale: opzioni con icona + preview-on-hover del pattern** — merged (squash) il 2026-06-06. Swatch glassa = `hex` + due overlay `feTurbulence` condivisi (grana multiply 0.45 + screziato bianco screen 0.9), zero asset, schema invariato; icone kind=image come sagoma monocromatica `mask-image` + `currentColor` (ink/bianco per stato card) — verificato asset RGBA alpha pulito, niente STOP; popup hover/focus col `layer_image` in portal su `document.body` (no clipping embla, no layout shift, Esc, soppresso su touch); AC6 radiogroup roving tabindex + frecce/Home/End. 7 AC Playwright (desktop+mobile su device Pixel 5 reale) + regressioni F01–F04/F14 = 25 e2e verdi; 51 unit; parità i18n. Review: **approved al primo giro**. Note minori non bloccanti annotate (kind=image non in radiogroup, popup non segue scroll, no aria-describedby).

**F14 · Empty-state continuo: preview sempre composta, transizione step invisibile** — merged (squash) il 2026-06-06. Refactor: step 1+2 unificati in `configurator-client.tsx` (PreviewCanvas montata una volta, mai rismontata → step1→2 pixel-identico), step 3 resta layout server separato; default `designs[0]` risolto SSR + `ReactDOM.preload` priorità alta (primo paint = piatto composto, niente buco bianco); PreviewCanvas riscritta a state-machine keyed-on-content con cross-fade commit-after-fade (fix bug layer stale impilati). Test F14 falsificabili (HTML SSR senza skeleton, pixel-diff step change, polling no-blank + regression stale) a 390/1280; F01/F02 adattati al nuovo DOM senza annacquarli (F01 AC "CTA disabilitata" superato by design: niente più empty state). Review: **approved al primo giro**.

**F03 · Scelta ceramica + carrello (step 3)** — merged (squash) il 2026-06-06 (PR #3, [8a32f19](https://github.com/danieledangeli/minkeramikk/commit/8a32f198f6a335ada784e4e981ae1abb17c69e09)). Step 3 prodotti del solo fornitore agganciato (RLS anon), carrello multi-item con Money VO (cents, no float, no cross-currency), persistenza localStorage + sync cross-tab. 51 unit + Playwright + RLS. Review: **approved al primo giro**. Coda CI: drift lockfile preesistente da PR #2 (`@swc/helpers`, Node 26 non-LTS vs CI Node 22) risolto pinnando **Node 24 LTS** come fonte unica (`engines.node` + `.nvmrc` + CI `node-version-file`, commit [582fdf0](https://github.com/danieledangeli/minkeramikk/commit/582fdf0)) — sanato anche il rosso di main. Da recepire in AGENTS.md: `npm ci` (non `install`) nella DoD locale + `.nvmrc` unica fonte versione Node.

**F02 · Personalizzazione design** — merged il 2026-06-06 (PR #2): compositing layer (multiply; animal-shape normal in cima), lock colori per hex sui 4 casi, preview composta da step 1 (AC7), fix margine bordi. 40 unit + Playwright. Review: approved al primo giro.

**F01 · Scelta design** — merged (squash) il 2026-06-06. PR "F01 — Design selection": migration 0004 (ADR 0009), data layer anon, reducer, URL state, 28 unit + Playwright 390/1280. Review: approved al primo giro.

