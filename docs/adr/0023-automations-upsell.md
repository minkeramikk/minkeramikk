# ADR 0023 — Automazioni & upsell (regole «chi ha X → suggerisci Y»)

**Stato**: Accepted · 2026-08-29. Estende [ADR 0022](0022-sconti-quantita-per-prodotto.md)
(sconti quantità per prodotto), non la sostituisce.

## Contesto

Alessio vuole scrivere da solo le sue regole di cross-sell, senza uno sviluppatore, e
decidere lo sconto sul prodotto suggerito **regola per regola** — sue parole: «sul
serveringsfat ci metto un 15%, deal separati dai tier». Il trigger della regola è un
**gruppo di prodotti scelto da multi-select**, non una serie: la dipendenza dalla serie
(`categoria-step3-ceramiche`) è stata esplicitamente tagliata dal cliente il 28/8.

## Decisione

(a) Una regola è: un gruppo trigger (multi-select di prodotti) + una quantità minima
(1 = presenza) + un prodotto suggerito + una quantità + una modalità di sconto.

(b) Il trigger è «il carrello contiene almeno N pezzi del gruppo», dove N=1 significa
semplice presenza — nessun limite superiore diverso da questo.

(c) Tre modalità di sconto: `fixed` (default admin), `inherited` (il tier che il gruppo
trigger guadagna in quel momento), `none` (suggerisci, non scontare). **`fixed` è
indipendente dai tier e sopravvive al loro spegnimento** — la stessa indipendenza già
decisa per il deal fisso in ADR 0022.

(d) Una regola non scatta mai se il suo prodotto suggerito è già nel carrello — è
esattamente ciò che fa in pratica la clausola «e niente Piatti» del mockup (D1). Non si
costruisce una feature generale di "gruppo assente": resta un caso particolare coperto
da questo controllo puntuale.

(e) La riga suggerita eredita **configCode / snapshot / layer della riga che ha fatto
scattare la regola** (D2), perché una riga di carrello non può esistere senza una
config e «stesso design» è ciò che il cliente si aspetta. Questo vincola una regola a
un prodotto suggerito dello **stesso fornitore** del trigger.

(f) La riga di carrello memorizza solo `dealRuleId`; la percentuale è cercata dalla
config live nel browser e **ri-derivata dal DB lato server** prima di essere
congelata sullo snapshot — lo stesso confine di fiducia di ADR 0022 (d): il server
possiede lo sconto.

**Perimetro.** Questo ramo spedisce, oltre alle fondamenta dati (migration 0034: due
tabelle e la RPC di replace atomico per il gruppo trigger), anche l'UI admin di
authoring delle regole (`discount-rules-editor.tsx`, `saveDiscountRule`) e la logica
di matching nel carrello (`firstSuggestion`, `CartSuggestion`) — non più rimandate ai
task successivi. Resta fuori solo `deal_rule_id` come colonna su `order_items`: la
riga di carrello porta l'id regola in memoria, ma lo snapshot ordine congela solo
`discount_pct`/`discount_cents`/`discount_source`, mai l'id della regola.

**Alternative scartate:**
- *Una regola che punta a una serie* — il cliente ha tagliato la dipendenza il 28/8; un
  gruppo di prodotti (una tabella di join) copre lo stesso bisogno.
- *Salvare la percentuale scontata sulla riga di carrello* — un prezzo che il browser
  potrebbe modificare; stessa obiezione di ADR 0022 (d).
- *Un modale/popup per il suggerimento* — rifiutato dal cliente per iscritto (vale per
  ogni step della card, non solo per questo task di solo-schema).
- *Un motore di regole generico con condizioni e operatori* — tre campi (gruppo,
  quantità minima, sconto) coprono ogni regola che Alessio ha scritto finora; un DSL
  sarebbe un prodotto che nessuno ha chiesto.

## Conseguenze

- (+) Le regole sono righe, non deploy: Alessio le scrive da admin senza toccare codice.
- (+) `discount_rule_products` segue esattamente la stessa convenzione di
  `discount_products` (ADR 0022) e `design_products` (ADR 0017): tabella di join,
  replace atomico via RPC, RLS pubblica in lettura.
- (−) Il vincolo «stesso fornitore» (e) non è imposto da un trigger DB in questo task
  (a differenza di `design_products_same_supplier`, 0021): il prodotto suggerito è
  scelto in admin, dove la UI dei task successivi può filtrare per fornitore; se in
  futuro serve un'invarianza a livello DB, è un trigger additivo separato.
- (?) Se in futuro serve una vera clausola "e manca Y" (D1 nella sua forma generale),
  è una tabella di join in più — non prevista qui perché nessuna regola scritta finora
  la richiede.
