# ADR 0025 — Pool a prezzo pieno per regola: il trigger si consuma a multipli

**Stato**: Accepted · 2026-09-01 · revisiona [ADR 0023](0023-automations-upsell.md) (d) e
completa [ADR 0024](0024-offerte-lista.md). Estende [ADR 0022](0022-sconti-quantita-per-prodotto.md).

## Contesto

In `discount.ts` `triggerMinQty` era una **condizione**, mai un budget: niente lo decrementava.
Gli stessi 4 piatti accendevano ogni regola che partisse da 4, all'infinito, e ogni riga con il suo
`dealRuleId` veniva risolta da sola. Con una regola sola in produzione non si notava; con tre, il
negozio regalerebbe tre prodotti per lo stesso trigger.

Nello stesso punto era vietato l'upsell sullo stesso prodotto — «compra 4 piatti, altri 4 a metà
prezzo» — da due lucchetti: il `refine` di `actions.ts` e la guardia D1 di `activeSuggestions`
(«il prodotto suggerito è già nel carrello»). Non erano un bug: erano il modello che diceva la
verità, perché senza un budget quella regola sarebbe stata `4 → 8 → 16` e il negozio avrebbe
venduto tutto al 50 %.

## Decisione

Il modello si dice al cliente in una frase, ed è il test di ogni scelta:

> **Ogni offerta guarda quanti pezzi a prezzo pieno hai, e si applica una volta ogni N. I pezzi
> scontati non contano per nessuna offerta.**

Tre regole, in quest'ordine di precedenza:

1. **Il pool è PER REGOLA, non globale.** Due regole non si rubano le unità a vicenda: 4 piatti che
   accendono due offerte diverse le accendono **entrambe**. Il consumo *globale* fra regole
   diverse (modello «C») è esplicitamente fuori scope: si valuterà con i dati.
2. **Dentro la regola il trigger si consuma a multipli:**
   `applicazioni = floor(poolPrezzoPieno / rule.triggerMinQty)` e
   `maxCoveredQty = applicazioni × rule.suggestedQty`. 8 piatti con un'offerta da 4 valgono **due**
   applicazioni. Il budget è della REGOLA: due righe che portano la stessa regola se lo dividono,
   in ordine di carrello, invece di prenderselo entrambe.
3. **INVARIANTE — le unità scontate non entrano in nessun pool.** Né nel proprio, né in quello di
   un'altra regola. È ciò che rende il modello chiuso.

### Due passate, non una ricorsione

Il pool dipende da quali righe sono già coperte e le coperture dipendono dal pool. La circolarità
si spezza decidendo la pass 1 con un criterio di **sola identità**, non di prezzo:

- **Pass 1 — le unità a prezzo pieno** (`fullPricePool`). Una riga contribuisce al pool del suo
  prodotto se e solo se **non porta un `dealRuleId` corrispondente a una regola viva per quel
  prodotto**. Non serve sapere quanto quella riga sconta, solo che è una riga d'offerta: decidibile
  in una passata sola. Le righe escluse dalla multi-select (`included() === false`) non entrano in
  nessun pool, come già in ADR 0022.
- **Pass 2 — l'assegnazione** (`allocateDeals`). Per ogni regola si calcolano applicazioni e
  `maxCoveredQty` dal pool; poi si scorrono le righe in ordine di carrello e ognuna consuma dal
  budget: `covered = min(riga.quantity, rimanente)`.

Il criterio di pass 1 è deliberatamente **conservativo**: una riga che porta un `dealRuleId` non
alimenta mai un pool, nemmeno se il suo deal poi non si applica (trigger caduto, 0 %). Sbaglia
sempre dalla parte del negozio, mai del cliente, e nessuna catena `4 → 8 → 16` può innescarsi.

### Il punto fisso, sull'upsell stesso-prodotto

Regola: trigger = piatti, `triggerMinQty` 4, suggerito = piatti, `suggestedQty` 4, −50 %.

| stato | pool piatti (pass 1) | applicazioni | `maxCoveredQty` | coperte |
|---|---|---|---|---|
| 4 piatti pieni | 4 | 1 | 4 | 0 |
| + 4 piatti con `dealRuleId` | 4 (la riga deal non conta) | 1 | 4 | 4 |
| ricalcolo | 4 | 1 | 4 | 4 |

Stabile al secondo ricalcolo, e nessuna seconda applicazione. **Con il pool fatto bene il caso
«stesso prodotto» si chiude da solo: se serve un caso speciale, il modello è implementato male.**

### D1 cambia significato (revisiona ADR 0023 (d))

`activeSuggestions` non salta più una regola perché «il prodotto suggerito è nel carrello», ma
perché **l'offerta è già stata presa tutta**: `coperte ≥ maxCoveredQty`, cioè budget rimanente 0.
Il nuovo controllo assorbe anche il vecchio test sul trigger — senza pool non c'è budget.

Due conseguenze volute:
- l'upsell stesso-prodotto diventa esprimibile senza eccezioni;
- un prodotto suggerito comprato **a prezzo pieno** per conto suo non spegne più l'offerta: il
  cliente la vede e la può prendere, il che è ciò che il negozio voleva vendere.

### Cosa NON cambia

- Il **floor**: sotto `suggestedQty` non c'è offerta (`kind: "short"`). È il fix di un bug già
  pagato e non si tocca.
- `discount_pct` resta **un'etichetta**: tutta l'aritmetica passa da `discount_cents` e dal Money VO.
- Il vincolo **stesso-fornitore** (`suggestedSharesSupplier`), il rifiuto di una regola che non paga
  nulla (0 %), e `MAX_SUGGESTIONS` come limite di **visualizzazione**.
- La **percentuale** in modalità `inherited` resta il tier che il gruppo trigger guadagna su
  `qtyByProduct`: il tier è l'altro meccanismo e conta tutte le unità (ADR 0022). Il pool governa
  **quante volte** l'offerta si applica, non a che sconto — così nessun prezzo `inherited` cambia
  per effetto collaterale di questa decisione.

## Conseguenze

- (+) Il trigger si consuma: tre regole sullo stesso trigger non regalano più tre prodotti.
- (+) L'upsell sullo stesso prodotto è configurabile, senza codice dedicato.
- (+) Il modello si spiega in una frase, ed è la stessa frase che il negozio può dire al cliente.
- (−) Pass 1 è conservativa: un'offerta il cui deal è morto lascia comunque le sue unità fuori dai
  pool finché quelle righe restano in carrello. Accettato: sbaglia dalla parte del negozio.
- (−) Con lo stesso-prodotto sbloccato si possono configurare regole molto aggressive per sbaglio
  (trigger 1 → suggerisci 10). Non si vietano: l'admin ne stampa l'anteprima in chiaro sotto la
  regola, così nessuno può salvarne una senza averla letta.
- (?) Il consumo globale fra regole diverse (modello «C») resta aperto: si valuterà con i dati.
