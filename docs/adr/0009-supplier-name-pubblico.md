# ADR 0009 — Il nome del fornitore è pubblico, i contatti no

**Stato**: Accepted · 2026-06-06 · Precisa ADR 0006 e 0007

## Contesto

Conflitto emerso in F01: ADR 0007 e il design system richiedono il badge fornitore
visibile nel configuratore pubblico (la scelta del design aggancia un laboratorio e il
cliente deve vederlo), ma schema-er/ADR 0006 dichiaravano `suppliers` "mai esposto al
pubblico, solo authenticated". Verificato empiricamente: il join anon restituisce
`suppliers: null` e il badge resterebbe vuoto. Le due regole erano in contraddizione
perché "anagrafica fornitore" mescola due nature: identità di marca (pubblica per
natura — il nome del laboratorio è marketing) e dati operativi (riservati).

## Decisione

- **Pubblici (lettura anon)**: `suppliers.id`, `name`, `active` — SOLO su righe `active`.
- **Riservati (authenticated only)**: `email`, `phone`, `notes` — sempre.
- Meccanismo a scelta dell'implementazione purché il contratto regga: column-level
  grant + policy RLS sulle righe attive, oppure view dei soli campi safe esposta ad
  anon. Vietato esporre la riga intera.
- I test RLS devono coprire ENTRAMBI i lati: anon legge il nome, anon NON legge l'email.

## Conseguenze

- (+) Il badge fornitore funziona nel configuratore senza sacrificare la riservatezza operativa.
- (+) "Mai esposto al pubblico" di ADR 0006 resta vero per ciò che intendeva proteggere (contatti del laboratorio).
- (−) Una sottigliezza in più nella RLS, coperta da test su entrambi i lati.
