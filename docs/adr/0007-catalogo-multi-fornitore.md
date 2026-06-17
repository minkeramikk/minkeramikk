# ADR 0007 — Catalogo multi-fornitore: il design aggancia il fornitore

**Stato**: Accepted · 2026-06-05 · Estende ADR 0006

## Contesto

Specifica post-accettazione: il sito è multi-fornitore by default. Ogni laboratorio ha i
propri design, varianti colore e ceramiche; scelto un pattern, il cliente deve vedere solo
opzioni e prodotti di quel fornitore. NON è multi-tenant (ADR 0003 intatto): è una
dimensione del catalogo.

## Decisione

- `designs.supplier_id` e `products.supplier_id` **NOT NULL**: ogni design e ceramica
  appartiene a un fornitore.
- Flusso: step 1 mostra i design di tutti i fornitori attivi; scelto il design, il
  fornitore è **agganciato** → step 2 (opzioni, già scoped) e step 3 (prodotti, filtro
  `supplier_id`) mostrano solo il suo catalogo.
- **Carrello misto** ammesso (ogni articolo porta il suo fornitore). Il PDF d'ordine è
  **uno per fornitore** (split automatico), inviato all'email del supplier.
- `order_items.supplier_id` (NOT NULL, RESTRICT) + `supplier_name_snapshot`: il fornitore
  di riga è un fatto storico, indipendente dal join col prodotto (cancellabile).
- Limite MVP accettato: **stato per ordine**, non per fornitore (gestito con note interne;
  uno stato per riga sarebbe additivo).
- Import iniziale: catalogo esistente sotto il fornitore "Vietri".

## Conseguenze

- (+) Schema già predisposto (FK esistente): delta contenuto. Nuovo fornitore = anagrafica + design, nessun codice.
- (−) Back-office: assegnazione fornitore su ogni design/prodotto; PDF ordine splittato per fornitore.
