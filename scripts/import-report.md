# Import report — Squarespace → Supabase

Eseguito: 2026-06-05 · script `scripts/import-squarespace.ts` (task 1.6)
Progetto: `rqhsbpwvzesvqwdonirf` (West EU Paris) · rilanciato 2 volte per verifica idempotenza: **conteggi identici, nessun duplicato**.

## Conteggi reali vs attesi

| Entità | Atteso | Reale | Esito |
|---|---|---|---|
| suppliers | 1 (Vietri) | 1 | ✓ |
| products | 8 | 8 | ✓ |
| designs | 6 | 6 | ✓ |
| option_categories | tutte con `layer_slot` | 16 (tutte con layer_slot e kind) | ✓ |
| options totali | — | 277 | ✓ |
| palette Blomster | 21 | 21 nomi nel dizionario palette; **20 opzioni** per categoria floreal | ⚠ vedi anomalie |

Dettaglio options per categoria: blomster-1 details 20, borders 20 · blomster-2 leaves 20,
borders 20 · amalfi-dyr animal 14 (immagini), main-color 20, plants-color 20, inner-circle 20,
dots 19 · krabbe line 1 (immagine), colors 20, borders 20 (sync_group `crab`) · striper
stripes 20 · juletre tree 1 (immagine), decorations 21, borders 21.

## Verifiche post-import

- Anon (RLS): vede 6 designs `active`, 0 suppliers, 0 orders ✓
- Storage: `products/vietri-dyp.png` servito pubblico (HTTP 200) ✓
- Rilancio script: stessi conteggi, upsert su slug + wipe&insert options ✓

## Anomalie

1. **Palette 21 vs opzioni 20**: il colore palette `#ecae67` "Marroncino Jettica" non ha
   varianti nei layer floreal1/floreal2 del sito live (20 PNG per categoria, non 21).
   Importate le 20 reali; il nome palette inutilizzato resta documentato qui.
2. **striper/stripes: 5 item scartati** — la raccolta live contiene 5 foto stock
   residue di Squarespace senza hex nel filename ("Aro Ha…", "Trade-151…"): non sono
   colori del configuratore, esclusi correttamente.
3. **amalfi-dyr/dots ha 19 opzioni** (le altre raccolte colore 20): la raccolta live
   `animals-dotter` contiene 19 file. Importato fedelmente.
4. I **layer PNG pre-colorati** delle raccolte colore (es. 20 varianti floreal1-detaljer)
   NON sono stati caricati su Storage: nel nuovo modello (ADR 0004) le opzioni colore
   portano `hex` e la ricolorazione è live via `mix-blend-mode` (F02). Se serviranno
   come riferimento, lo snapshot legacy resta in `docs/legacy/`.
5. **hovering-colors** non importata: nel legacy serviva solo per i tooltip hover
   (immagini swatch), sostituita dagli `hex` nel nuovo modello.
6. `name_en` dei prodotti e `description_en` dei design: bozze in inglese da revisionare
   (nei sorgenti marcate `TODO:nb-review` per la coppia NO/EN).
