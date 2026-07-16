# ADR 0018 — Palette glasse per fornitore (normalizzazione delle opzioni colore)

**Stato**: Accepted · 2026-07-16 · Revisiona in parte ADR 0012 · Implementato in F35

## Contesto

Oggi ogni opzione `kind=color` porta il proprio `name`/`hex`/`image` (swatch). La stessa
glassa è quindi ripetuta su ogni design e categoria che la usa: rinominarla o cambiarne la
foto richiede N modifiche a mano, e nulla garantisce che due opzioni "stesso colore"
restino coerenti (nome, hex, swatch). Il fornitore ragiona invece per **tavolozza di
glasse**: un set finito di colori riusati su tutti i suoi design. F35 aggiunge anche un
import massivo dei layer dove i file Photoshop sono nominati per `#hex`: serve un punto di
verità unico contro cui matchare.

Vincolo: il configuratore pubblico deve restare **pixel-identico** (DTO `CategoryOption`
invariato) e gli ordini già emessi non vanno toccati (portano snapshot immutabili).

## Decisione

1. **Tabella `supplier_colors`** (`id, supplier_id, hex, name, swatch_image, active,
   sort_order`), una per fornitore: nome/hex/swatch vivono **una volta sola**.
   `UNIQUE(supplier_id, hex)` e `UNIQUE(supplier_id, name)`; `hex` con CHECK `^#[0-9a-f]{6}$`
   (minuscolo).
2. **Le opzioni `kind=color` puntano** alla palette via `options.supplier_color_id`
   (FK NO ACTION deferrable) e **smettono di portare** `name`/`hex`/`image` (diventano NULL: arrivano
   dal join). `kind=image` **invariato**.
3. **Modello a due vie via trigger** `options_kind_shape` (la relazione è cross-table col
   `kind` su `option_categories`, quindi non può essere un CHECK di colonna): `kind=color`
   ⇒ `supplier_color_id` NOT NULL **e** stesso fornitore del design; `kind=image` ⇒
   `supplier_color_id` NULL e `image` NOT NULL. Questo **sostituisce** la CHECK
   `num_nonnulls(image,hex)` di ADR 0005/0012.
4. **Backfill in-migration** (0022): una riga di palette per `(supplier, lower(hex))`, primo
   per `sort_order` vince nome+swatch; le opzioni si ricollegano; i campi copiati sulle
   opzioni colore vengono azzerati. Pre-launch, additivo, mai con `db reset`.
5. **Replace atomico** via RPC `replace_supplier_colors(p_supplier_id, p_rows jsonb)`
   (mirror di `replace_product_attributes`, ADR 0017): la FK opzioni→palette è
   `ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE` e la RPC la defera per il ciclo
   delete+reinsert (stesso id ⇒ passa al commit; rimuovere davvero un colore in uso ⇒ 23503
   → messaggio "disattiva"). **NO ACTION, non RESTRICT**: RESTRICT dà la stessa protezione ma
   il suo check non è deferibile, quindi la delete nella RPC fallirebbe subito (migration 0023
   corregge la 0022, che l'aveva dichiarata RESTRICT).
6. **RLS**: lettura pubblica (l'anon risolve nome/hex/swatch nel configuratore), scrittura
   authenticated.

### Alternative scartate

- **Tabella colori globale (non per fornitore)**: rompe l'incapsulamento multi-fornitore
  (ADR 0007) — un fornitore non deve vedere/riusare le glasse di un altro.
- **Vista/denormalizzazione mantenuta da trigger** (tenere le colonne copiate sincronizzate):
  più superficie di bug della normalizzazione, e non elimina la duplicazione.
- **CHECK di colonna** per la forma a due vie: impossibile, il `kind` è su un'altra tabella.

## Conseguenze

- (+) Rinomina/rifoto di una glassa = **una** modifica, propagata a tutto il catalogo.
- (+) Punto di verità unico per il match `#hex → colore` dell'import massivo (F35).
- (+) Configuratore invariato: il read-path riempie il DTO `CategoryOption` dal join.
- (−) Read-path colore ora fa un join in più; una migration con backfill e un trigger nuovi.
- (−) `options.name` perde il `NOT NULL` (serve alle opzioni colore azzerate): le opzioni
  `kind=image` mantengono il nome obbligatorio **a livello app** (zod), non più DB.
- (✓) Il nome del constraint FK auto-generato è `options_supplier_color_id_fkey`
  (confermato sullo staging; la RPC lo referenzia in `set constraints`, e 0023 lo
  ricrea con lo stesso nome).
- (?) Formato dell'import palette e monolinguismo del nome (card §11) da confermare con
  Alessio — non toccano l'architettura.

Revisiona **in parte** ADR 0012: il principio "swatch reale + hex fallback" resta valido,
cambia solo *dove* vive (nella palette del fornitore, non copiato per opzione).
