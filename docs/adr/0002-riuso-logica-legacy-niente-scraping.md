# ADR 0002 — Riuso della logica configuratore legacy, data layer riscritto

**Stato**: Accepted · 2026-06-04

## Contesto

Il configuratore attuale è un code block Squarespace (~640KB) che funziona in produzione:
preview con layer `<img>` sovrapposti e `mix-blend-mode: multiply`, codice configurazione
serializzato, carrello. I dati però arrivano da scraping di ~20 pagine Squarespace nascoste,
con nome/prezzo/colore codificati nei filename delle immagini — fragile e non amministrabile.

## Decisione

- **Si riusa** la logica validata: compositing multiply (niente canvas), formato del codice
  configurazione, flusso a 3 step. Porting in moduli TS puri (`src/lib/configurator/`) con unit test.
- **Si butta** il data layer: niente scraping, i dati vengono SOLO dal DB Supabase
  (server components / route handlers).
- Prima del porting si salva uno snapshot immutabile del code block in `docs/legacy/`
  come riferimento (il sito live può cambiare).

## Conseguenze

- (+) Il rischio più alto del progetto (resa visiva della preview) è de-rischiato: tecnica già validata.
- (+) Stima configuratore ridotta (~10-14h invece di 16-24h).
- (−) Il codice legacy è monolitico: si estraggono solo le funzioni utili, non si copia il blocco.
- (✓ deciso col cliente, 2026-06-05) Nessun codice configurazione in circolazione presso
  clienti finali: NIENTE retro-compatibilità, formato codice nuovo e pulito.
