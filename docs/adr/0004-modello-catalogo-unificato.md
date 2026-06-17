# ADR 0004 — Catalogo unificato: categorie `image|color`, niente tabella palettes

**Stato**: Accepted · 2026-06-05

## Contesto

Nel sito attuale i colori non sono un set globale: `crabcolors`, `animals-*`,
`hovering-colors` e le 21 "palettes" di Blomster sono raccolte separate legate alla loro
categoria. Una tabella `palettes` globale non rappresenta questa realtà. La preview compone
layer con z-order preciso (alcune opzioni ricolorate via multiply, altre PNG a colore fisso):
lo schema deve dirlo.

## Decisione

Modello uniforme: **una categoria contiene opzioni**, pattern o colori. Schema, naming
(inglese) e indici normativi: [schema-er.md](schema-er.md).

- `layer_slot`: strato preview in cui scrive la categoria (base/mid/top/extra/detail/animal).
- `orders.locale`: lingua del cliente → email di conferma localizzata.
- Snapshot in `order_items`: l'ordine resta leggibile anche se il catalogo cambia.
- `sync_group` (text, nullable) su `option_categories`: modella "Lås Farger" — categorie
  colore dello stesso design e stesso sync_group si sincronizzano col lock attivo (coppie
  reali: `crabColors ↔ crabKanter`, `julepynt ↔ treeKant`).
- Nomi design (Blomster 1, Amalfi Dyr) non tradotti: nomi propri.

## Conseguenze

- (+) Import 1:1 dalle raccolte Squarespace; back-office uniforme; una tabella in meno.
- (−) Colori uguali ripetuti tra categorie (accettabile in single-tenant, ADR 0003).
