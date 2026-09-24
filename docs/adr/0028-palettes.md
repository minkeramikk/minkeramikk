# ADR 0028 — Palette con nome: codice congelato nel browser, nome deterministico

**Stato**: Accepted · 2026-09-18

## Contesto

Release 5, card R5-PALETTES. I colori scelti allo step 2 devono poter essere **salvati con un
nome** («Cobalto», «Corallo»), riusati allo step 3 per dipingere le ceramiche aggiunte e le righe
unpainted, e scelti riga per riga da un picker.

Le forze in gioco. La configurazione corrente **vive già nell'URL**: le selezioni dello step 2 si
risolvono da `opt_*` (`resolveSelections`) e lo step 3 riceve `configCode`, `configSnapshot` e
`designLayers` come props renderizzate dal server. Esiste già un codec `?code=` che decodifica un
codice in design + opzioni, coperto da una e2e core. La card 1 (ADR 0027) ha lasciato
`paintLines(cart, lineId, n, code, snapshot, layers)`, che accetta **qualsiasi** codice. Il carrello
sta in `localStorage` e non si migra. Non c'è tabella, non c'è login: una palette è roba del
browser di chi la crea.

## Decisione

**Una palette è un codice di configurazione congelato, con un nome.**

- `Palette = { code, name, designSlug, snapshot, layers, createdAt, usedAt }` in `localStorage`
  accanto al carrello, **massimo 10 in LRU**: quando ne arriva un'undicesima esce quella **usata**
  meno di recente, non la più vecchia. Dedup per `code`: due bozze identiche sono una palette sola,
  e salvarla di nuovo ne aggiorna l'uso, non il nome.
- Salvare = chiamare `buildConfigLinePayload`, che restituisce già `{ snapshot, configCode,
  designLayers }`: i campi della palette **sono** i campi che la riga di carrello porta. Dipingere
  con una palette resta `paintLines` della card 1, invariata.
- **La palette attiva è l'URL** (`?code=…`). È l'unica fonte di verità: la leggono il canvas dello
  step 2, lo snapshot dello step 3 e l'aggiunta dalla griglia. Cambiare palette attiva è una
  navigazione, non uno stato client.
- **Una palette non attiva non tocca mai l'URL**: il picker di riga dipinge leggendo lo snapshot e i
  layer *dalla palette salvata*, così la scelta vale per quella riga e la palette attiva non si
  muove.
- **Il nome è deterministico e non è un numero.** La famiglia viene dall'hue del colore principale
  (la categoria «colori principali» del design se c'è, altrimenti la prima selezione con un hex); la
  parola esce dalla lista di quella famiglia con un hash del codice. Stessi colori, stesso nome,
  oggi e dopo un rebuild.
- **Le liste sono configurabili dal negozio**: sorgente di verità `lib/palettes/name-lists.ts`
  (pigmenti della maiolica, **in italiano, mai tradotti** — è il vocabolario del fornitore, ADR
  0012), con override opzionale `MK_PALETTE_WORDS` (JSON della stessa forma) leggibile da Vercel.
  Se l'override è assente o malformato si usa il file e si logga un warning: un errore di battitura
  in una dashboard non può spegnere il configuratore.
- **Una palette non si modifica mai.** Il rename cambia il nome; i colori sono il codice, e il
  codice è l'identità.

Alternative scartate:

- **Palette in tabella, lato server**: nessun login, nessun utente — servirebbe inventarlo. Il
  carrello sta già nel browser: metterle altrove creerebbe due durate diverse per la stessa scelta.
- **Palette attiva come stato React** accanto all'URL: due fonti di verità per «la configurazione
  corrente», e ogni superficie a domandarsi quale delle due guardare. È il bug che l'ADR 0027 ha
  appena finito di pagare quattro volte, in altra forma.
- **Nome progressivo («Palette 3»)** o nome scelto al salvataggio: il primo non dice niente e si
  rompe con l'LRU (il 3 può tornare libero), il secondo mette un campo di testo tra il cliente e il
  suo carrello. Il rename resta, ma dopo, e opzionale.
- **Liste tradotte NO/EN**: i nomi dei colori del fornitore non si traducono (ADR 0012); tradurre
  solo le parole di palette avrebbe dato due nomi diversi alla stessa palette a seconda della
  lingua, e il nome è un'identità che il cliente legge e ritrova.

## Conseguenze

- (+) Zero migrazioni, zero schema, zero server: la card è tutta nel browser.
- (+) La card 1 non si tocca: `paintLines` riceveva già un codice qualsiasi, ed era il motivo per
  cui era stata scritta così.
- (+) Il nome è stabile e riproducibile: un test può asserirlo senza mock, e il supporto può
  ricalcolarlo da un codice.
- (−) Chi pulisce il browser perde le palette, come perde il carrello. Non c'è recupero.
- (−) Cambiare palette attiva costa una navigazione (il loader arriva con la card 5).
- (−) Il riconoscimento della categoria «colore principale» passa dall'etichetta della categoria
  (`Hovedfarge`, o un'etichetta che contiene «colour»/«color»): un design che la chiami altrimenti
  ricade sulla prima selezione colorata — degrada, non sbaglia, ma il nome può nascere da un colore
  d'accento.
- (?) `MK_PALETTE_WORDS` è una leva d'esercizio: va documentata dove si documentano le altre
  variabili d'ambiente, altrimenti esiste solo in questo ADR.
