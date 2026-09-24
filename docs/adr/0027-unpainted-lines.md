# ADR 0027 — Righe di carrello senza colori: codice nullo, gate sull'ordine

**Stato**: Accepted · 2026-09-18

## Contesto

Release 5 (card R5-UNPAINTED) chiede che una ceramica possa stare nel carrello **senza
colori**: il cliente sceglie prima gli oggetti, poi le palette. Finora ogni riga nasce da
una configurazione: `CartLine.configCode` è una stringa e 44 file la danno per tale — il
link `set=`, l'ordine, il PDF di laboratorio, le offerte upsell, il drawer.

Le forze in gioco: il carrello vive in `localStorage` e non si migra (F03); gli sconti
quantità aggregano per `productId` e non devono cambiare di una corona (ADR 0022); ordini,
mail e PDF già consegnati non possono regredire; il budget della card è di 6–6,5 h su una
release a prezzo fisso, quindi un refactor dei 44 consumatori non è in fornitura.

## Decisione

**Una riga senza colori è una riga normale con il codice nullo.**

- `CartLine.configCode: string | null`. `configSnapshot` è `null` e `layers` assente sulla
  riga unpainted: non c'è nulla da comporre.
- L'identità resta `lineKey(productId, configCode)`, con `null` → `${productId}::unpainted`.
  Ne segue gratis che due aggiunte senza colori dello stesso prodotto **si fondono**, come
  già accade per due aggiunte con la stessa configurazione: nessun ramo nuovo in `addToCart`.
- Due primitive pure, testate, sono l'unico modo di cambiare stato:
  `paintLines(cart, lineId, n, code, snapshot, layers)` sposta `n` pezzi sulla riga che
  porta quel codice (merge se esiste, la sorgente sparisce se si svuota) e
  `unpaintLines(cart, lineId, n)` fa l'inverso. Dipingere è un **trasferimento**: prezzo,
  pezzi e sconto non si muovono.
- **Il gate è sull'ordine, non sul carrello.** `createOrder` rifiuta con 400 e codice
  `unpainted` prima di Turnstile, dello sconto e del DB; il client non monta nemmeno il
  form e la pillola dice «Paint N pieces first». PDF e mail sono irraggiungibili per
  costruzione: stanno a valle dell'ordine.
- Gli altri consumatori ricevono **guardie, non refactor**: un `&&`, un `?`, un ritorno
  anticipato. In particolare un'offerta upsell non eredita un codice nullo (niente design,
  niente offerta) e una riga senza codice non entra nel link `set=`.
- Il messaggio visibile del 400 vive in `messages/` (NO/EN): il server restituisce un
  codice stabile, non una frase.

Alternative scartate:

- **Una collezione separata di «righe da dipingere»**: due sorgenti di verità per lo stesso
  carrello, due conteggi, due punti dove sbagliare lo sconto — e il merge con le righe
  colorate da riscrivere a mano.
- **Codice sentinella (`""` o `"UNPAINTED"`)**: passa i tipi e per questo attraversa in
  silenzio ogni guardia; finirebbe in un ordine reale invece di fermarsi al confine.
- **Vietare il carrello misto** (ordine bloccato dal carrello, non dall'ordine): è la
  promessa della release al contrario — il carrello misto È la funzionalità.

## Conseguenze

- (+) Zero migrazioni: un carrello salvato prima della release resta valido, ogni riga ha
  già un codice.
- (+) Gli sconti sono corretti dall'arrivo della riga: `qtyByProduct` conta per prodotto,
  quindi una riga unpainted contribuisce e beneficia della scala come le altre.
- (+) Le primitive sono pure: la card 2 (palette nominate) passerà un codice qualsiasi a
  `paintLines` senza toccare il modello.
- (−) `configCode` nullable va guardato in ogni nuovo consumatore: TypeScript lo impone
  al compilatore, ma un `!` distratto lo aggira.
- (−) Una riga unpainted non è condivisibile: esce dal link `set=` finché la card 4 non
  introduce il codice vuoto nell'encoder.
- (?) Il conteggio globale è in **pezzi** (`(pieces ?? 1) × quantity`, come `cartPieces`),
  mentre gli stepper di riga contano unità (un set = un'unità). Il mockup contava righe;
  decisione del TL il 18/9.
