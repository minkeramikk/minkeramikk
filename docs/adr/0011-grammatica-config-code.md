# ADR 0011 — Grammatica del codice di configurazione

**Stato**: Accepted · 2026-06-06

## Contesto

Il configuratore deve produrre un **codice copiabile** che salva/ricarica una configurazione
esatta (F04) e funge da **identificatore canonico** su ordine (F05), mail cliente e PDF
fornitore (F08). L'originale usava codici tipo `MK-B2-A18-3-Q1`: leggibili, dettabili,
self-contained. Vincolo di **longevità**: un cliente torna col codice settimane dopo, mentre
l'admin può aver riordinato/aggiunto/tolto opzioni → i segmenti NON possono ancorarsi a
indici o `sort_order` volatili.

## Decisione

1. **Formato** `MK-<D>-<s1>-…-<sN>`: `<D>` = `designs.code`; un segmento per categoria,
   **ordinati per `option_categories.slug` ascendente** (lo slug è stabile, il `sort_order`
   no); `<sK>` = `options.code`, unico nella categoria.
2. **Alfabeto** `A–Z` + `2–9`, esclusi gli ambigui `0 O 1 I L`; separatore `-`. Input
   case-insensitive, tollerante su spazi/separatori.
3. **Stabilità**: `designs.code` e `options.code` sono colonne **persistite**, assegnate
   all'import e **mai ricalcolate**; codici dismessi non riusati.
4. **Decode tollerante** (mai crash): segmento mancante/opzione non trovata → default
   categoria; segmenti in eccesso → ignorati; `designs.code` sconosciuto → messaggio cortese.
5. **Canonico**: questo codice È `order_items.config_code`; `config_snapshot` (jsonb) resta
   accanto per la storicità.
6. **Bidirezionale con l'URL**: `encode(selezioni) ↔ codice ↔ opt_*` (riusa lo stato URL F14).

## Alternative scartate

- *base64url self-contained*: robusto ma illeggibile, inadatto a PDF/dettatura.
- *ID persistito su tabella*: serve storage+endpoint+RLS, non self-contained.
- *Segmenti su `sort_order`/indice*: si rompono al primo riordino admin.

## Conseguenze

- (+) Codice fedele all'originale; un solo identificatore in tutto il sistema; decode stateless.
- (−) Colonne `code` + backfill + unicità a DB (additiva); ogni nuova opzione/design serve un
  `code` valido (regola nel CRUD admin); gli slug di categoria si trattano come stabili.
