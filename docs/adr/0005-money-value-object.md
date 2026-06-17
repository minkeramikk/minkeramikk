# ADR 0005 — Prezzi: Money value object, minor units + currency

**Stato**: Accepted · 2026-06-05

## Contesto

La prima bozza usava `prezzo_kr int` (valuta implicita). Si vende solo in NOK, ma il
multi-valuta è plausibile — e non è una conversione a cambio (è "un prezzo per currency",
decisione commerciale per mercato).

## Decisione

- Ogni importo nel DB è **minor units + valuta**: `price_cents int` (øre/cent) +
  `currency char(3)` ISO 4217, default `'NOK'`. **Mai float, mai importi senza valuta.**
  Stesso pattern negli snapshot di `order_items`.
- Value object **`Money`** in `src/lib/money/`: aritmetica e formattazione (`Intl.NumberFormat`
  sul locale attivo). **Tutta** l'aritmetica/formattazione prezzi passa SOLO da qui.
- **Non** si crea ora `product_prices`: flessibilità non richiesta. Quando servirà, migration
  additiva (`INSERT ... SELECT`) che tocca solo il data layer, isolato dal VO.

## Conseguenze

- (+) Multi-valuta futuro = aggiunta, non refactor; formattazione localizzata gratis (ADR 0001).
- (−) `price_cents` poco leggibile a occhio (50000 = 500 kr): convenzione documentata qui e in AGENTS.md.
