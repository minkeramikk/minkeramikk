# ADR 0001 — Sito bilingue norvegese/inglese dal giorno 1

**Stato**: Accepted · 2026-06-04

## Contesto

Il sito attuale è solo norvegese; il committente vuole anche clienti non norvegesi e lo
sviluppatore non conosce il norvegese. Retrofittare l'i18n dopo che le route esistono
costa un refactor doloroso (tutto sotto `[locale]`, ogni stringa ripassata).

## Decisione

- `next-intl` dal primo commit; locales `no` (default) e `en`; route pubbliche sotto
  `src/app/[locale]/(public)`. Back-office solo inglese, fuori da `[locale]`.
- Dizionari `src/i18n/messages/{no,en}.json`, chiavi namespaced in inglese, **parità di
  chiavi obbligatoria** (nella Definition of Done).
- Campi DB visibili al pubblico in doppia colonna `_no`/`_en`.
- Testi norvegesi nuovi: tradotti e marcati per revisione del cliente (sua responsabilità
  contrattuale).

## Conseguenze

- (+) Costo marginale ora (~3-4h) contro un refactor doloroso dopo; revisione NO = un solo file JSON.
- (−) Ogni stringa va scritta due volte (coperto dal check di parità chiavi).
