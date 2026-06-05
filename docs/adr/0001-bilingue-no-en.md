# ADR 0001 — Sito bilingue norvegese/inglese dal giorno 1

**Stato**: Accepted · 2026-06-04

## Contesto

Il sito attuale è solo in norvegese. Il committente vuole raggiungere anche clienti
non norvegesi; lo sviluppatore non conosce il norvegese. Retrofittare l'i18n in Next.js
dopo che le route esistono significa spostare tutto sotto `[locale]` e ripassare ogni stringa.

## Decisione

- `next-intl` dal primo commit; locales `no` (default) e `en`; route pubbliche sotto `src/app/[locale]/(public)`.
- Dizionari `src/i18n/messages/{no,en}.json`, chiavi namespaced in inglese, parità di chiavi obbligatoria.
- Campi DB visibili al pubblico in doppia colonna `_no`/`_en`.
- Back-office solo inglese, fuori da `[locale]`.
- Testi norvegesi: recuperati dal sito live dove esistono; i nuovi tradotti e marcati per revisione del cliente (responsabilità contrattuale del cliente, vedi preventivo).

## Conseguenze

- (+) Costo marginale ora (~3-4h) contro un refactor doloroso dopo.
- (+) La revisione norvegese è un singolo file JSON consegnabile al cliente.
- (−) Ogni stringa nuova va scritta due volte; la Definition of Done include il check di parità chiavi.
