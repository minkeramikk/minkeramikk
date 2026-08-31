# ADR 0022 — Sconti quantità per prodotto (aggregazione cross-design)

**Stato**: Accepted · 2026-08-29

## Contesto

Alessio ha respinto uno sconto percentuale a livello di carrello («il 10% per qualsiasi
prodotto non ha senso»): lo sconto che vuole premia l'acquisto di *molti pezzi della stessa
ceramica*, e i suoi clienti raggiungono quella quantità componendo set con **design diversi**
sulla stessa ceramica — lo stesso piatto in tre decori diversi conta come "4 piatti", non come
tre acquisti separati da un pezzo. I prezzi sono già congelati sulla riga d'ordine
(`price_cents_snapshot`, ADR 0005), e ci sono ordini reali in produzione: ogni cambio di schema
deve essere additivo (AGENTS.md, divieto `db reset --linked`).

Scala confermata dal cliente il 27/8: `4 → 5%` · `6 → 8%` · `8 → 10%` · `12 → 15%`.

## Decisione

(a) Una scala globale unica di soglie `(min_qty, pct)`, editabile in admin, accendibile /
spegnibile da `settings.quantity_discounts_enabled`. Righe in `discount_tiers`, non un blob
jsonb: un form admin come lista semplice, e una riga malformata non può corrompere le altre.

(b) L'unità di aggregazione è `product_id` **attraverso i design**: si sommano le quantità del
carrello per prodotto, e la percentuale risultante si applica a ogni riga di quel prodotto —
mai per riga singola.

(c) L'inclusione è un multi-select opt-out in `discount_products` dove **nessuna riga = tutti
inclusi** (stessa convenzione di `design_products`, ADR 0017): un prodotto escluso resta a
prezzo pieno e non innesca mai nulla.

(d) Lo sconto è calcolato da **un'unica funzione pura**, usata sia dal browser sia dal server;
all'invio dell'ordine il **server ricalcola dal DB e congela i propri numeri** sulla riga
(`discount_pct`, `discount_cents`, `discount_source`) — i numeri del browser non vengono mai
persistiti.

(e) La ratifica è `orders.discount_ratified_at`, un timestamp nullable, gemello di `paid_at`
(ADR 0021): lo sconto mostrato in vetrina è un'offerta, la conferma del negozio è ciò che lo
rende reale.

(f) L'arrotondamento avviene **una sola volta per riga**, half-up, sul totale della riga,
tramite una nuova operazione `percentOf()` sul Money VO — mai per unità, mai in floating point.

**Perimetro — cosa il server NON possiede (C3, TL 29/8).** Questo ADR sposta *lo sconto*
dietro al server: la percentuale calcolata dal browser non viene mai persistita. **Non** sposta
*il prezzo unitario*. `src/components/ui-domain/order-form.tsx:69-81` posta `unitPriceCents` e
`src/lib/orders/create.ts` lo congela così com'è — lo status quo da F05, qui deliberatamente
invariato. La frase corretta è quindi «**il server possiede lo sconto, il client dichiara ancora
il prezzo**», mai «il server possiede il prezzo». Chiudere questo secondo varco significherebbe
far risolvere il prezzo al server via `product_id` al momento dell'ordine: una garanzia
separata, su una card separata, da valutare a sé. Scritto qui perché nessuno legga questo ADR e
creda che il confine di fiducia sia più esterno di quanto sia davvero.

**Alternative scartate:**
- *Un blob jsonb di soglie in `settings`* — una riga malformata corromperebbe l'intera scala e
  il form admin dovrebbe parsare il jsonb; le righe costano una tabella in più, ma isolano il
  guasto.
- *Salvare solo `discount_pct` sulla riga e ricalcolare l'importo in lettura* — le regole di
  arrotondamento dovrebbero restare congelate per sempre perché un ordine storico continui a
  tornare; salvare i cents è un intero in più e chiude la questione.
- *Fidarsi dello sconto calcolato dal client* — sono soldi che attraversano un confine di
  fiducia; lo sconto lo possiede il server.
- *Una riga di sconto a livello di carrello* — esplicitamente respinta dal cliente.

## Conseguenze

- (+) Un ordine storico è autoesplicativo senza bisogno di leggere la config corrente.
- (+) I due meccanismi si spengono senza toccare una riga di codice.
- (−) Le tabelle delle soglie sono leggibili pubblicamente (accettato: il loro contenuto è
  comunque mostrato a ogni visitatore). Per lo stesso motivo diventano pubblicamente leggibili
  anche i due nuovi flag di `settings`: `quantity_discounts_enabled` deve esserlo perché il
  carrello anonimo sappia se applicare gli sconti; `automations_enabled` segue la stessa riga
  (nessun dato sensibile in nessuno dei due).
- (−) Lo sconto è "soft" — nulla impedisce al negozio di confermare un ordine il cui sconto non
  ha letto (mitigato dal dialog di conferma che mostra i totali).
- (?) Se arriverà un mercato con una seconda valuta (R4-MARKET-EUR), la scala è
  currency-independent (percentuali) ma le *soglie* potrebbero richiedere una revisione
  per-valuta.
