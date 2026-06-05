# ADR 0006 — Suppliers come anagrafica operativa (non tenant)

**Stato**: Accepted · 2026-06-05

## Contesto

I prodotti sono realizzati fisicamente da laboratori ceramici esterni (es. Vietri).
Il requisito originale del cliente includeva la gestione fornitore-prodotto-prezzo;
era stata semplificata via nell'ipotesi "un solo fornitore". Il fornitore operativo
NON va confuso col tenant (il ceramista proprietario del negozio): quello resta
escluso (ADR 0003).

## Decisione

- Tabella `suppliers (id, name, email, phone, notes)` + `products.supplier_id`
  FK ~~nullable (`ON DELETE SET NULL`)~~ — **superato da ADR 0007**: con il catalogo
  multi-fornitore le FK sono NOT NULL e la cancellazione è RESTRICT (si disattiva, non si cancella).
- Nel back-office: anagrafica minima (lista + form) e una tendina sul prodotto.
- Nessun impatto sul sito pubblico: il fornitore non è mai mostrato al cliente finale.

## Conseguenze

- (+) Riallinea lo schema al requisito originale; costo additivo quasi nullo.
- (+) Il workflow reale ("girare l'ordine al laboratorio giusto") ha un posto nel dato.
- (−) Una CRUD in più nel back-office (piccola).
