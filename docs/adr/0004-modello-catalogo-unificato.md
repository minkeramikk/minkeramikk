# ADR 0004 — Catalogo unificato: categorie `image|color`, niente tabella palettes

**Stato**: Accepted · 2026-06-05

## Contesto

Nel sito attuale i colori NON sono un set globale: `crabcolors`, `animals-maincolor`,
`animals-plantscolor`, `hovering-colors` e le 21 "palettes" di Blomster sono raccolte
separate, ognuna legata alla propria categoria di opzioni. Una tabella `palettes` globale
(prima bozza dello schema) non rappresenta questa realtà. Inoltre la preview compone
layer con z-order preciso e alcune opzioni si ricolorano via multiply mentre altre sono
PNG a colore fisso: lo schema deve dirlo.

## Decisione

Modello uniforme: una categoria contiene opzioni, che siano pattern o colori.
Diagramma ER completo: [schema-er.md](schema-er.md).

Schema completo, naming e indici: [schema-er.md](schema-er.md) (naming DB in inglese).

- `layer_slot`: in quale strato della preview scrive la categoria (base/mid/top/extra/detail/animal).
- `orders.locale`: lingua del cliente → email di conferma nella lingua giusta.
- Snapshot in `order_items`: un ordine resta leggibile anche se il catalogo cambia o un prodotto viene cancellato.
- Nomi design (Blomster 1, Amalfi Dyr) non tradotti: nomi propri.

## Conseguenze

- (+) Import 1:1 dalle raccolte Squarespace; back-office uniforme (una UI per tutte le categorie).
- (+) Una tabella in meno; nessun join speciale per i colori.
- (−) Colori uguali ripetuti tra categorie (accettabile in single-tenant, ADR 0003).
- (✓ verificato sul codice live, 2026-06-05) "Lås Farger": stato `colorLocked` (default off)
  che, se attivo, propaga la scelta colore alle categorie imparentate — coppie trovate:
  `crabColors ↔ crabKanter` (match per hex via `syncColors`), `julepynt ↔ treeKant`.
  Modellato con `sync_group` (text, nullable) su option_categories: categorie colore dello
  stesso design e stesso sync_group si sincronizzano quando il lock è attivo.
