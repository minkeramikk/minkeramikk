# ADR 0005 — Prezzi: Money value object, minor units + currency

**Stato**: Accepted · 2026-06-05

## Contesto

La prima bozza usava `prezzo_kr int` (corone intere, valuta implicita). Oggi si vende
solo in NOK, ma EUR/GBP sono un'evoluzione plausibile. Un prezzo in altra valuta non è
una conversione a cambio (decisione commerciale per mercato), quindi il futuro
multi-valuta è "un prezzo per currency", non "un tasso di cambio".

## Decisione

- Ogni importo nel DB è **minor units + valuta**: `price_cents int` (øre/cent) +
  `currency char(3)` ISO 4217, default `'NOK'`. Mai float, mai importi senza valuta.
  Stesso pattern negli snapshot di `order_items`.
- In TypeScript, value object **`Money`** in `src/lib/money/`: costruzione, somma,
  moltiplicazione per quantità, confronto, formattazione via `Intl.NumberFormat`
  con il locale attivo ("1 300 kr" per `no`, "NOK 1,300" per `en`).
  Tutta l'aritmetica e la formattazione prezzi passa SOLO da questo modulo.
- **Non** si crea ora la tabella `product_prices (product_id, currency, amount_cents)`:
  comprerebbe flessibilità non usata pagandola in join, admin UI multi-prezzo e logica
  di selezione valuta che oggi non ha requisiti. Quando servirà: migration additiva
  (`INSERT ... SELECT` dai prodotti) e si tocca solo il data layer, isolato dal VO.

## Conseguenze

- (+) Multi-valuta futuro = aggiunta, non refactor; i componenti non conoscono le colonne.
- (+) Formattazione coerente e localizzata gratis, agganciata all'i18n (ADR 0001).
- (−) `price_cents` è meno leggibile a occhio nel DB (50000 = 500 kr): convenzione da
  conoscere, documentata qui e in AGENTS.md.
