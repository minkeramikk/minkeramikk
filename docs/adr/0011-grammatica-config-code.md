# 0011 — Grammatica del codice di configurazione

Status: Accepted (2026-06-06)

## Contesto

Il configuratore deve produrre un **codice copiabile** che salva/ricarica una
configurazione esatta (flusso F04) e che funge da **identificatore canonico**
dell'articolo su ordine (F05), mail cliente e PDF al fornitore (F08).

Il sito originale usava codici tipo `MK-B2-A18-3-Q1`, derivati dalle scelte:
leggibili, dettabili al telefono, self-contained (il codice porta con sé tutta
la configurazione, senza lookup su DB).

Requisito di **longevità**: un cliente può tornare col codice settimane dopo,
mentre nel frattempo l'admin (F09/F10) può riordinare, aggiungere o togliere
opzioni. Quindi i segmenti del codice NON possono ancorarsi a indici o a
`sort_order` volatili: si romperebbero al primo riordino.

Lo stato è già nell'URL (`design` + `opt_*`, da F14), ma un URL non è un buon
"codice prodotto": lungo, non dettabile, non sta bene su un PDF.

## Decisione

1. **Formato**: `MK-<D>-<s1>-<s2>-…-<sN>`
   - `MK` prefisso fisso.
   - `<D>` = `designs.code` (corto, stabile, unico).
   - un segmento per option-category, **ordinati per `option_categories.slug`
     ascendente** (lo slug è stabile; il `sort_order` è mutabile e NON si usa per
     l'ordine dei segmenti).
   - `<sK>` = `options.code`, unico nella sua categoria.
2. **Alfabeto**: maiuscole `A–Z` + cifre `2–9`, **esclusi** i caratteri ambigui
   `0 O 1 I L`; separatore `-`. Input case-insensitive (normalizzato a maiuscolo),
   tollerante su spazi/separatori.
3. **Stabilità**: `designs.code` e `options.code` sono colonne **persistite**,
   assegnate all'import e **mai ricalcolate**. L'admin assegna codici nuovi e non
   riusa quelli dismessi. Così un codice resta valido anche se il catalogo cambia.
4. **Decode tollerante** (mai crash, AC F04): si parte dal design; per ogni
   categoria corrente (in ordine di slug) si cerca il segmento per `options.code`;
   segmento mancante o opzione non trovata → default della categoria; segmenti in
   eccesso (categoria rimossa) → ignorati; `designs.code` sconosciuto → messaggio
   cortese, nessuna ricostruzione.
5. **Canonico**: questo codice È `order_items.config_code` (snapshot d'ordine),
   compare in mail cliente e sul PDF fornitore (F08). `config_snapshot` (jsonb
   leggibile) resta accanto per la storicità anche se il catalogo cambia.
6. **Bidirezionale con l'URL**: `encode(selezioni) → codice`; incollare un codice
   → `opt_*` nell'URL → ricostruzione (riusa lo stato URL di F14).

## Conseguenze

Positive:
- Codice fedele all'originale: leggibile, dettabile, stampabile, robusto nel tempo.
- Un solo identificatore in tutto il sistema (configuratore, ordine, mail, PDF).
- Decode stateless rispetto a un DB delle configurazioni (nessuna tabella di
  salvataggio): la mappatura codice→opzioni usa il catalogo già caricato.

Negative / costi:
- Richiede colonne `code` su `designs` e `options` + backfill all'import + unicità
  garantita a DB (migration **additiva**).
- Vincola la grammatica: ogni nuova opzione/design deve ricevere un `code` valido e
  unico (regola da inserire nel CRUD admin, F09).
- L'ordine dei segmenti dipende dallo slug di categoria: rinominare uno slug
  cambierebbe l'interpretazione. Gli slug si trattano come stabili (coerente con il
  vincolo esistente `UNIQUE(design_id, slug)`).

## Alternative scartate

- **base64url self-contained**: robusto e zero-schema, ma illeggibile e inadatto a
  PDF / dettatura telefonica — perde il senso di "codice prodotto".
- **ID persistito su tabella**: codici più corti, ma servono storage + endpoint +
  RLS, contro l'etica "minimo server"; e non è self-contained.
- **Segmenti su `sort_order`/indice**: si rompono al primo riordino dell'admin.
