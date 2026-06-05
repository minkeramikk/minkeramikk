# ADR 0007 — Catalogo multi-fornitore: il design aggancia il fornitore

**Stato**: Accepted · 2026-06-05 · Estende ADR 0006 (suppliers non più solo anagrafica)

## Contesto

Specifica del cliente post-accettazione: il sito è multi-fornitore by default. Ogni
fornitore (laboratorio) ha i propri design/pattern, le proprie varianti colore e le
proprie ceramiche. Il cliente che sceglie un pattern deve vedere, negli step successivi,
solo opzioni e prodotti di quel fornitore. NON è multi-tenant (ADR 0003 intatto: un solo
negozio, un solo admin): è una dimensione del catalogo.

## Decisione

- `designs.supplier_id` e `products.supplier_id` diventano **NOT NULL**: ogni design e
  ogni ceramica appartengono a un fornitore.
- Flusso configuratore: lo step 1 mostra i design di tutti i fornitori attivi; la scelta
  del design **aggancia il fornitore** per quell'articolo — step 2 (opzioni, già scoped
  via design) e step 3 (prodotti: filtro `supplier_id`) mostrano solo il suo catalogo.
- **Carrello misto**: articoli di fornitori diversi convivono nello stesso ordine
  (ogni articolo ha il suo fornitore, implicito nel design scelto).
- Il PDF d'ordine per il laboratorio viene generato **uno per fornitore** (split
  automatico delle righe per supplier), inviato all'email del rispettivo supplier.
- `order_items.config_snapshot` include anche supplier (id e nome) per leggibilità storica.
- Import iniziale: tutto il catalogo esistente sotto il fornitore "Vietri" (o nome reale).

## Conseguenze

- (+) Lo schema era predisposto (FK già esistente): delta contenuto.
- (+) Aggiungere un fornitore = inserire anagrafica + caricare i suoi design. Nessun codice.
- (−) Back-office: ogni design/prodotto richiede l'assegnazione a un fornitore (tendina).
- (−) Il PDF ordine si complica (split per fornitore) — gestito in fase 3.
