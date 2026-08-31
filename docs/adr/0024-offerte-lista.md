# ADR 0024 — Le offerte upsell sono una lista, non una card alla volta

**Stato**: Accepted · 2026-08-31 · supera parzialmente [ADR 0023](0023-automations-upsell.md)

## Contesto

ADR 0023 (c)/(d) e la §3.23 del design system fissano una **card gentile, una alla
volta, chiudibile**. È una delle sei conferme scritte di Alessio del 27/8 e la e2e
AC-SC6 la difendeva alla lettera.

L'esercizio ha mostrato il costo di quella scelta. `firstSuggestion` restituiva **una**
proposta: con due regole sullo stesso trigger, il cliente ne vedeva una sola e per
arrivare alla seconda doveva **rifiutare la prima con la ✕**. In pratica la seconda
regola che Alessio configura in admin non la vede quasi nessuno — la pagina admin
promette qualcosa che il negozio non consegna. Il difetto non è nel codice: è nella
regola di prodotto.

## Decisione

**1. Le offerte eleggibili si mostrano tutte insieme, in un unico blocco**, nell'ordine
in cui le regole stanno in admin. Nessuno scoring, nessuna euristica «migliore offerta»:
la precedenza la decide il negozio ordinando le sue regole, e il carrello la rispetta.
`firstSuggestion` diventa `activeSuggestions` e restituisce una lista.

**2. Cap a `MAX_SUGGESTIONS` = 3 offerte simultanee.** Oltre, il carrello smette di
suggerire e diventa un catalogo. Le regole in eccesso non si mostrano, senza errore e
senza riordino.

**3. La ✕ chiude il blocco, non la singola offerta.** Chiudere una card per rivelare la
successiva è esattamente il comportamento che questa decisione elimina.

**4. Accettare un'offerta la toglie dalla lista e lascia le altre.** Non serve logica
nuova: (d) di ADR 0023 la esclude già perché il suo prodotto è ora nel carrello. Il
blocco si accorcia e sparisce quando è vuoto.

**5. Resta tutto il resto di ADR 0023**: mai un popup né un overlay, i filtri D1/D2, il
trigger, l'esclusione dalla multi-select, il pavimento e il tetto dell'offerta.

**6. La riga suggerita eredita la configurazione della riga trigger che corrisponde a
quella che il cliente sta guardando** allo step 3, quando ce n'è una; altrimenti vale il
criterio precedente (quantità maggiore, prima vista a parità). Supera il tie-break di
ADR 0023 (e), che il codice indovinava: con 8 Amalfi e 4 Juletre in carrello l'offerta
arrivava vestita Amalfi anche mentre il cliente studiava Juletre.

*Alternative scartate:* **ordinare per convenienza** — introduce un giudizio di valore
che il negozio non ha chiesto e rende imprevedibile ciò che l'admin ha ordinato a mano.
**Nessun cap** — tre offerte sono un suggerimento, sei sono un volantino. **Rendere il
donatore generico** (una pagina invece di una riga di carrello): `buildSuggestionLine`
ha un contratto tutto forma-riga, generalizzarlo è un refactor che questo cambio non
richiede.

## Conseguenze

- (+) Le regole oltre la prima diventano visibili: l'admin consegna ciò che promette.
- (+) L'ordine resta una leva dell'admin, non un'opinione del codice.
- (−) **Supera una conferma scritta del cliente** («una alla volta», 27/8). Va comunicata
  ad Alessio: non è un dettaglio implementativo, è ciò che vedrà nel carrello.
- (−) La e2e AC-SC6 difendeva letteralmente la vecchia regola ed è stata **riscritta**,
  non cancellata: ciò che sopravvive — un blocco solo, mai un dialog — resta difeso.
- (?) Due regole che suggeriscono lo **stesso** prodotto ora producono due righe per la
  stessa ceramica a prezzi diversi. Prima il difetto era invisibile perché si vedeva una
  card sola. Non si deduplica qui: sarebbe inventare una regola che nessuno ha chiesto.
  **Da decidere con il cliente.**
