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

**Amendment (2026-09-19, R5-TEXT-IDENTITY)** — segmento iscrizione: dopo gli `N`
segmenti colore, `encodeConfigCode` può aggiungere UN segmento posizionale in più,
`parts[cats.length]`, che porta l'iscrizione del cliente sulla ceramica e/o l'hash
del suo desiderio colore (mai il testo del desiderio — solo l'hash, non
reversibile: R5-GARANZIA.md §5). Formato del segmento (`text-segment.ts`):
`<flags><checksum><noteHash?><textPayload?>`. Nessun carattere sentinella nel
segmento stesso: la posizione lo identifica, perché l'encoder emette sempre
esattamente un segmento per categoria (default inclusi), quindi per un dato
design l'indice `cats.length` è stabile.

**Amendment (2026-09-19, round 2 della review finale) — checksum**: la sola
posizione NON basta a distinguere in modo affidabile un segmento-iscrizione da
un normale codice-opzione finito lì per coincidenza — cosa che succede ogni
volta che un design PERDE una categoria (`cats.length` si riduce, e il
segmento colore che occupava l'ultimo slot ricade esattamente nello slot
dell'iscrizione di ogni codice già salvato per quel design). Misurato prima
del fix: senza contromisura, 232/961 codici-opzione di 2 caratteri e 7672/29791
di 3 caratteri decodificano come "contenuto" plausibile (flags+payload che
paiono validi per puro caso sui bit), e una parte produce un'iscrizione-fantasma
stampabile che raggiungerebbe il campo, il codice, la mail e il PDF di
laboratorio. Il segmento include quindi un checksum di 2 caratteri (`fnv1a`
di `flags + noteHash? + textPayload?`, RIUSATO — non una seconda funzione
hash) subito dopo `flags`; il decode accetta lo slot come iscrizione SOLO se
il checksum combacia, altrimenti è un segmento in eccesso e va ignorato,
esattamente come già diceva il punto 4 fin dall'origine di questo ADR. Con la
contromisura, misurato di nuovo sulle lunghezze di codice-opzione realmente in
uso oggi (1-2 caratteri): 0/31 e 0/961 decodificano come contenuto (erano
232/961 a 2 caratteri; anche alle 3 lunghezza, 0/29791, contro 7672/29791
prima).

**Degradazione onesta**: un design che perde una categoria rende illeggibile
(non corrotta, non "a caso") l'iscrizione dei codici più vecchi salvati per
quel design — il checksum impedisce che il decode restituisca mai
un'iscrizione-fantasma; nel caso raro in cui il vecchio segmento colore
combaci per puro caso col checksum atteso, l'iscrizione va semplicemente
persa a favore della lettura come colore (il comportamento che questo ADR
richiede al punto 4), mai il contrario, e mai un errore o un crash per il
cliente che riapre un vecchio link.

## Alternative scartate

- *base64url self-contained*: robusto ma illeggibile, inadatto a PDF/dettatura.
- *ID persistito su tabella*: serve storage+endpoint+RLS, non self-contained.
- *Segmenti su `sort_order`/indice*: si rompono al primo riordino admin.

## Conseguenze

- (+) Codice fedele all'originale; un solo identificatore in tutto il sistema; decode stateless.
- (−) Colonne `code` + backfill + unicità a DB (additiva); ogni nuova opzione/design serve un
  `code` valido (regola nel CRUD admin); gli slug di categoria si trattano come stabili.
