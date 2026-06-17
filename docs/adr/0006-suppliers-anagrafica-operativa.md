# ADR 0006 — Suppliers come anagrafica operativa (non tenant)

**Stato**: Accepted · 2026-06-05 · Parzialmente superato da ADR 0007 (FK suppliers)

## Contesto

I prodotti sono realizzati da laboratori ceramici esterni (es. Vietri). Il requisito
originale includeva la gestione fornitore-prodotto-prezzo, poi semplificata via. Il
fornitore operativo NON è il tenant (il ceramista proprietario, escluso da ADR 0003).

## Decisione

- Tabella `suppliers (id, name, email, phone, notes)` + `products.supplier_id`.
  > La FK era nullable `ON DELETE SET NULL`; **superato da ADR 0007**: con il catalogo
  > multi-fornitore le FK sono NOT NULL e la cancellazione è RESTRICT (si disattiva).
- Back-office: anagrafica minima + tendina sul prodotto. Nessun impatto sul sito pubblico.

## Conseguenze

- (+) Riallinea lo schema al requisito originale; il workflow reale ha un posto nel dato.
- (−) Una CRUD in più (piccola).
