# ADR 0009 — Il nome del fornitore è pubblico, i contatti no

**Stato**: Accepted · 2026-06-06 · Precisa ADR 0006 e 0007

## Contesto

Conflitto emerso in F01: ADR 0007 e il design system vogliono il badge fornitore visibile
nel configuratore pubblico, ma ADR 0006/schema-er dichiaravano `suppliers` "solo
authenticated" (il join anon dà `suppliers: null`, badge vuoto). "Anagrafica fornitore"
mescola due nature: identità di marca (pubblica) e dati operativi (riservati).

## Decisione

- **Pubblici (anon)**: `suppliers.id`, `name`, `active` — SOLO su righe `active`.
- **Riservati (authenticated)**: `email`, `phone`, `notes` — sempre.
- Meccanismo libero (grant column-level + RLS sulle righe attive, oppure view dei soli
  campi safe), purché **mai esposta la riga intera**.
- Test RLS su **entrambi i lati**: anon legge il nome, anon NON legge l'email.

## Conseguenze

- (+) Il badge funziona senza sacrificare la riservatezza; "mai esposto" di ADR 0006 resta vero per i contatti.
- (−) Una sottigliezza in più nella RLS, coperta dai test.
