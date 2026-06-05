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
> e gli AC vengono raffinati. Ordine di tiraggio consigliato: F01 → F06 → F02 → F03 →
> F04 → F05 → F07 → F09 → F10 → F08 → F11 → F12.

### Backlog

---

**F13 · Swatch con anteprima pattern (hover/focus)** — FE · dep: F02
Scope: elevare l'esperienza colore allo step 2 al livello del sito originale (di netto
superiore al nostro swatch attuale): passando il mouse — o col focus da tastiera — su uno
swatch colore, un floating card mostra il pattern di quella categoria in quel colore
(= `layer_image` dell'opzione, già in DB per ADR 0010; nessun compositing runtime).
AC (bozza):
- Hover/focus su uno swatch → popup con l'anteprima del pattern in quel colore, vicino allo swatch, senza spostare il layout
- Da tastiera: il focus mostra lo stesso popup; Esc lo chiude; nessuna trappola di focus
- Touch/mobile: nessun popup hover — la PreviewCanvas principale resta la fonte di verità (si aggiorna al tap)
- Performance: l'anteprima usa l'immagine già esistente, lazy-load, niente jank su griglie da ~20 swatch
Test: funzionale Playwright hover + focus tastiera a 1280; verifica che su 390 il popup non compaia e il tap aggiorni la preview principale.
Nota priorità: enhancement, NON sul percorso critico (F02→F05). Tirare dopo che il flusso ordine è vivo.





---

**F04 · Codice configurazione: salva / carica / condividi** — FE+BE · dep: F02
Scope: codice leggibile + URL condivisibile che riapre la configurazione esatta;
formato NUOVO (niente retro-compat, ADR 0002).
AC (bozza):
- Da step 2/3 copio un codice; incollandolo (o aprendo l'URL) la configurazione si ricostruisce identica
- Codice invalido → messaggio cortese, mai crash
Test: unit roundtrip encode/decode (property-based sui cataloghi possibili) · funzionale condivisione URL.

---

**F05 · Invio ordine** — FE+BE · dep: F03
Scope: form ordine (nome, email, telefono, messaggio) con Turnstile; `POST /api/orders`
con validazione zod; codice `MK-NNNN` progressivo; email cliente (lingua = `orders.locale`)
+ notifica admin via Resend; pagina di conferma.
AC (bozza):
- Invio il carrello → ordine e righe nel DB con snapshot (nome, prezzo, currency, config) e stato `new`
- Ricevo email di conferma nella MIA lingua; l'admin riceve la notifica
- Bot senza token Turnstile → 400; due invii ravvicinati non creano codici duplicati
Test: unit generazione codice ordine e snapshot · funzionale flusso completo con mock email · RLS insert-only.

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

---

**F03 · Scelta ceramica + carrello (step 3)** — FE+BE(read) · dep: F02 [DONE]
Scope: step 3 del configuratore: scelta della ceramica tra i SOLI prodotti del fornitore
agganciato dal design (ADR 0007), quantità, e carrello multi-articolo persistito in
localStorage. Tutta l'aritmetica prezzi passa dal value object `Money` esistente
(`src/lib/money/`, ADR 0005) — qui usato per la prima volta sul serio.

AC (definitivi, 2026-06-06):
1. Allo step 3 vedo SOLO le ceramiche `visible=true` del fornitore del design scelto
   (query anon su `products.supplier_id`, RLS), prezzo via `formatMoney` (no `1 300 kr`,
   en `NOK 1,300`). Mai un prezzo senza valuta.
2. Scelgo ceramica + quantità → "Aggiungi al carrello" crea una riga col design
   configurato corrente (config_code + snapshot leggibile), prodotto, quantità, prezzo unitario.
3. Carrello persistito in localStorage: chiudo e riapro il browser → c'è ancora, identico;
   ogni item resta legato al suo fornitore.
4. Carrello misto (2 fornitori, ADR 0007): ogni riga mostra prodotto, design, quantità,
   fornitore (SupplierBadge), subtotale; totale = `sum()` di Money in cents, mai float,
   mai cross-currency.
5. Modifica quantità e rimozione riga aggiornano totale e localStorage; carrello vuoto →
   empty state con CTA "torna al configuratore".
6. Mobile 390px: lista leggibile, touch target ≥44px, nessun overflow.

Test: unit cart store (add, update qty, remove, persist/hydrate, totale misto) + Money
già coperti · funzionale Playwright scegli→aggiungi→ricarica→presente a 390/1280 ·
RLS: anon vede solo prodotti visible del fornitore.
Evidenza PR: screenshot step 3 + carrello a 390/768/1280.
Nota: niente checkout/pagamento (finto e-commerce) — l'invio ordine è F05.

*(vuota)*

### In progress

*(vuota)*


### In review
*(vuota)*

### Done

**F02 · Personalizzazione design** — merged il 2026-06-06 (PR #2): compositing layer (multiply; animal-shape normal in cima), lock colori per hex sui 4 casi, preview composta da step 1 (AC7), fix margine bordi. 40 unit + Playwright. Review: approved al primo giro.

**F01 · Scelta design** — merged (squash) il 2026-06-06. PR "F01 — Design selection": migration 0004 (ADR 0009), data layer anon, reducer, URL state, 28 unit + Playwright 390/1280. Review: approved al primo giro.

