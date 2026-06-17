# ADR 0002 — Riuso della logica configuratore legacy, data layer riscritto

**Stato**: Accepted · 2026-06-04

## Contesto

Il configuratore attuale è un code block Squarespace (~640KB) funzionante (preview con
layer `<img>` in `mix-blend-mode: multiply`, codice configurazione, carrello), ma i dati
arrivano da scraping di ~20 pagine nascoste con nome/prezzo/colore nei filename: fragile e
non amministrabile.

## Decisione

- **Si riusa** la logica validata (compositing multiply senza canvas, formato codice,
  flusso a 3 step), portata in moduli TS puri (`src/lib/configurator/`) con unit test.
- **Si butta** il data layer: niente scraping, i dati vengono **SOLO dal DB Supabase**.
- Snapshot immutabile del code block salvato in `docs/legacy/` prima del porting.
- (col cliente, 2026-06-05) **Nessuna retro-compatibilità** del codice configurazione:
  formato nuovo e pulito, nessun vecchio codice in circolazione.

## Conseguenze

- (+) De-risca il rischio più alto (resa della preview): tecnica già validata; stima ridotta.
- (−) Dal legacy monolitico si estraggono solo le funzioni utili, non il blocco intero.
