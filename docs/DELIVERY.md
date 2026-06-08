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
> e gli AC vengono raffinati. Ordine di tiraggio consigliato: F01✅ → F02✅ → F03✅ → F14✅ → F13✅ → F04✅ → **F05** → F15 → F06 → F07 → F09 → F10 → F08 → F11 → F12.

### Backlog

> Priorità UX del configuratore (decisa 2026-06-06): F14 e F13 si tirano PRIMA di F05.
> Il configuratore deve essere "bello e fedele all'originale" quando il cliente lo vede,
> anche a costo di posticipare di poco il flusso ordine end-to-end.







---

**F15 · Step 2 IDENTICO all'originale: asset reali + griglia verticale** — FE+BE(dati) · dep: F02 [DONE], F13 [DONE]
Tira **subito dopo F05** (decisione 2026-06-08). Obiettivo del proprietario: lo step 2
deve essere *identico* all'originale — l'esperienza è ottima e gli asset (thumbnail
texturizzate + icone) sono curati, vanno usati così come sono, non approssimati.

Ciclo: dati/asset (Passo 0) → UI (griglia + render asset reali).

Tre fronti:
1. **Layout verticale** (supera il carosello embla di F02, DESIGN-SYSTEM §4): ogni categoria
   mostra TUTTE le opzioni in griglia che va a capo, niente scroller orizzontale.
2. **Swatch colore = foto-glassa reale** (ADR 0012, §3.10): si mostra `options.image` (la
   thumbnail texturizzata originale) se presente; la grana procedurale F13 resta come
   **fallback/placeholder** per i colori senza foto; flat `hex` ultimo fallback.
3. **Icone `image` (animali) = arte originale su tile grigio** (supera il monocromatico di
   F13, §3.9): l'arte originale bianco+viola su tile `--muted`; selected tile `--primary`.
   Niente `mask-image`.

**Passo 0 (dati/asset, STOP-gated)** — ADR 0012:
- **Migration additiva**: rilassare il CHECK `options` da `num_nonnulls(image,hex)=1` a
  `>= 1` (un colore può avere image+hex+layer_image insieme). Rigenerare i tipi.
- **Re-import idempotente** (estende `scripts/import-squarespace.ts`): recuperare le
  swatch images originali (`hovering-colors` + collezioni colore per categoria) in
  `options.image` per le opzioni `kind=color`; e verificare/recuperare le icone animali
  originali (bianco+viola) per le `kind=image`. Report conteggi come 1.5/0006.
- STOP per confermare la sorgente degli asset prima della UI; se una collezione non è più
  disponibile sul legacy, escalare.

AC (bozza):
1. Step 2: tutte le opzioni di ogni categoria in griglia a capo, nessuno scroller-x, a 390
   e 1280; selezione da tastiera (radiogroup, frecce) invariata.
2. Swatch colore: mostra la foto-glassa reale (`options.image`); colore senza foto →
   placeholder grana procedurale; mai flat-only se la foto esiste.
3. Icone `image`: arte originale bianco+viola su tile grigio, leggibili normali e selezionate;
   nessun monocromatico residuo.
4. Hover-preview (F13) del pattern invariato; config code, preview, color-lock senza regressioni.
5. DB: un'opzione colore può portare image+hex+layer_image (CHECK rilassato) → pronto per il
   CRUD asset del back-office (F10).
Test: unit (re-import idempotente, conteggi) · Playwright (niente scroll-x; swatch reale vs
placeholder; icona con asset giusto; tastiera) a 390/1280; aggiornare e2e F13 (carosello/mask).
Evidenza PR: step 2 affiancato all'originale (colori + animali) + report import asset.

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
*(vuota)*

### In progress
*(vuota)*

---

**F05 · Invio ordine** — FE+BE · dep: F03 [DONE], F04 [DONE]
Scope: form ordine + Turnstile; `POST /api/orders` con validazione zod; codice ordine
**contatore progressivo** `MK-NNNN` (decisione 2026-06-06, da sequence Postgres, parte
da 1001); email cliente (lingua = `orders.locale`) + notifica admin via Resend; pagina
di conferma. Tutto pronto a monte: carrello (F03), config code canonico (F04), Money VO.

**Passo 0 (dati)**: migration additiva per la **sequence** ordini (es. `order_seq`
START 1001) — niente reset. Il codice = `MK-` + valore della sequence (concorrenza-safe).

Ciclo: dati (sequence) → API `/api/orders` (zod + snapshot + email) → form UI + conferma.

AC (definitivi, 2026-06-06):
1. Form (nome, email, telefono, messaggio) con validazione client + server dallo **stesso
   schema zod**; widget Turnstile, token inviato col payload.
2. `POST /api/orders` valida il payload (zod, incluse le righe carrello); in transazione
   crea `orders` (status `new`, `locale` = locale corrente, `code` dalla sequence) + un
   `order_items` per riga con snapshot COMPLETI: `supplier_id` (NOT NULL) +
   `supplier_name_snapshot`, `product_id` + `product_name_snapshot`, `price_cents_snapshot`
   + `currency_snapshot`, `config_code` (canonico ADR 0011), `config_snapshot` (jsonb
   leggibile), `quantity`. Prezzi sempre cents+currency, mai float.
3. Codice ordine `MK-NNNN` progressivo, unico, **concorrenza-safe** (sequence): due submit
   ravvicinati → due codici distinti, zero duplicati.
4. Turnstile verificato server-side col secret: token mancante/invalido → 400, nessun
   ordine creato.
5. Email Resend: conferma cliente nella sua lingua (`orders.locale`) con codice ordine +
   riepilogo; notifica admin. Test con transport mock/fake (niente invii reali in CI).
6. Successo → carrello svuotato (localStorage) + redirect a pagina conferma col codice;
   errore → carrello preservato, messaggio cortese, nessun ordine parziale.
7. RLS: anon può INSERT su orders/order_items ma NON select/update (insert-only pubblico,
   migration RLS 0002) — test negativo che lo dimostra.
8. i18n NO/EN su form, conferma ed email; mobile 390px.
Test: unit (codice/sequence, costruzione snapshot per riga incl. split per fornitore, schema
zod) · funzionale Playwright flusso completo carrello→form→conferma con email mockata ·
RLS insert-only (anon non legge ordini).
Evidenza PR: screenshot form+conferma 390/1280, esempio payload→righe DB, esempio email (mock).
Dipendenze/STOP: Turnstile (test key Cloudflare in dev) + Resend (mock in test, sender
verificato a deploy). STOP se la sequence non è concorrenza-safe o se manca la RLS insert-only.

→ spostata in **In review** 2026-06-08 (branch `flow/f05-order-submit`, PR da aprire).

### In review

**F05 · Invio ordine** — branch `flow/f05-order-submit`, PR body `PR-F05-body.md`, **non ancora merged** (in attesa review agent). DoD verde: lint pulito · 77 unit (9 file) · build 31 route · Playwright 33 desktop + mobile F05 4/4 · parità i18n NO/EN. STOP-condition soddisfatte: sequence `order_seq` concorrenza-safe (`nextval`, due submit ravvicinati → codici distinti, verificato in integration test) + RLS insert-only provata (`rls.test.ts`: anon INSERT ok ma SELECT su orders invisibile). Decisioni: `create_order` SECURITY DEFINER atomico (orders + order_items per riga con snapshot completi, prezzi cents+currency); Turnstile verificato server-side (secret), in dev/CI test-key always-pass + auto-token; transport email no-op iniettabile (nessun invio reale in CI); form con `noValidate` (zod unico validatore client+server); carrello passato come prop (single source con CeramicsStep) + `clear()` su successo. Evidenza: `docs/evidence/f05/` (form 390/1280, conferma).

### Done

**F04 · Codice configurazione: salva / carica / condividi** — merged (squash) il 2026-06-06 (ADR 0011). Migration additiva 0006 (`designs.code` UNIQUE, `options.code` UNIQUE per categoria, no reset); backfill idempotente via UPDATE puri (id stabili per ordini): 6 code design + 277 code opzioni, 0 NULL/ambigui/dup, re-run 0/0; import ora chiama `assignMissingCodes`. Codec puro `config-code.ts` (encode ordinato per slug, decode tollerante mai-crash, alfabeto 31 simboli). UI `ConfigCodeBar` (copia codice/link + incolla) in step 2/3. **AC5**: step 3 produce ora il codice canonico (`encodeConfigCode`), non più la query-string interim di F03 → un solo formato per F05/F08. 63 unit (round-trip property-based 600 seeded) + 30 e2e. Review: **approved al primo giro**. Nota: design code single-char sequenziali (A–F), mnemonici via admin in futuro.

**F13 · Step 2 stile originale: opzioni con icona + preview-on-hover del pattern** — merged (squash) il 2026-06-06. Swatch glassa = `hex` + due overlay `feTurbulence` condivisi (grana multiply 0.45 + screziato bianco screen 0.9), zero asset, schema invariato; icone kind=image come sagoma monocromatica `mask-image` + `currentColor` (ink/bianco per stato card) — verificato asset RGBA alpha pulito, niente STOP; popup hover/focus col `layer_image` in portal su `document.body` (no clipping embla, no layout shift, Esc, soppresso su touch); AC6 radiogroup roving tabindex + frecce/Home/End. 7 AC Playwright (desktop+mobile su device Pixel 5 reale) + regressioni F01–F04/F14 = 25 e2e verdi; 51 unit; parità i18n. Review: **approved al primo giro**. Note minori non bloccanti annotate (kind=image non in radiogroup, popup non segue scroll, no aria-describedby).

**F14 · Empty-state continuo: preview sempre composta, transizione step invisibile** — merged (squash) il 2026-06-06. Refactor: step 1+2 unificati in `configurator-client.tsx` (PreviewCanvas montata una volta, mai rismontata → step1→2 pixel-identico), step 3 resta layout server separato; default `designs[0]` risolto SSR + `ReactDOM.preload` priorità alta (primo paint = piatto composto, niente buco bianco); PreviewCanvas riscritta a state-machine keyed-on-content con cross-fade commit-after-fade (fix bug layer stale impilati). Test F14 falsificabili (HTML SSR senza skeleton, pixel-diff step change, polling no-blank + regression stale) a 390/1280; F01/F02 adattati al nuovo DOM senza annacquarli (F01 AC "CTA disabilitata" superato by design: niente più empty state). Review: **approved al primo giro**.

**F03 · Scelta ceramica + carrello (step 3)** — merged (squash) il 2026-06-06 (PR #3, [8a32f19](https://github.com/danieledangeli/minkeramikk/commit/8a32f198f6a335ada784e4e981ae1abb17c69e09)). Step 3 prodotti del solo fornitore agganciato (RLS anon), carrello multi-item con Money VO (cents, no float, no cross-currency), persistenza localStorage + sync cross-tab. 51 unit + Playwright + RLS. Review: **approved al primo giro**. Coda CI: drift lockfile preesistente da PR #2 (`@swc/helpers`, Node 26 non-LTS vs CI Node 22) risolto pinnando **Node 24 LTS** come fonte unica (`engines.node` + `.nvmrc` + CI `node-version-file`, commit [582fdf0](https://github.com/danieledangeli/minkeramikk/commit/582fdf0)) — sanato anche il rosso di main. Da recepire in AGENTS.md: `npm ci` (non `install`) nella DoD locale + `.nvmrc` unica fonte versione Node.

**F02 · Personalizzazione design** — merged il 2026-06-06 (PR #2): compositing layer (multiply; animal-shape normal in cima), lock colori per hex sui 4 casi, preview composta da step 1 (AC7), fix margine bordi. 40 unit + Playwright. Review: approved al primo giro.

**F01 · Scelta design** — merged (squash) il 2026-06-06. PR "F01 — Design selection": migration 0004 (ADR 0009), data layer anon, reducer, URL state, 28 unit + Playwright 390/1280. Review: approved al primo giro.

