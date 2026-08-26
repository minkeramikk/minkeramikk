# ADR 0020 — Foto prodotto (cap 2) + serie di raggruppamento allo step 3

**Stato**: Accepted · 2026-08-26

## Contesto

Il mockup v5 (vincolante) dello step 3 del configuratore mostra, nella modale
prodotto, foto reali della ceramica scelta — oggi esiste solo `products.image`,
la thumb 256px del catalogo (classe F26 `products`), pensata per la griglia,
non per una modale a schermo più grande. Serve una piccola galleria (fino a 2
foto) per prodotto.

La stessa griglia va inoltre raggruppata per **serie** (rilievo 🔴 della
critique cliente: 23 prodotti reali in produzione, oggi mostrati come lista
piatta — diventa illeggibile).

## Decisione

**(a) Tabella dedicata `product_images`**, gemella di `design_images` (ADR
0019 / migration 0024): `id`, `product_id` FK → `products` ON DELETE CASCADE,
`image` (Storage path), `sort_order`. Stesso pattern RLS (SELECT pubblico per
il configuratore anon, scrittura solo `authenticated`) e stesso Storage owned,
invece di due colonne `photo_1`/`photo_2` su `products`: la tabella dà
riordino e cancellazione singola gratis (CRUD già noto in admin), e il numero
massimo di foto non è congelato nello schema.

**(b) Cap 2 applicativo**, nella server action del back-office (Task successivo
di questa card), non un `check` o un trigger DB. Il numero di foto è una
scelta di prodotto (quante ne mostra la modale), non un invariante di
dominio — alzarlo un domani (es. a 3) non deve costare una migration. Stessa
scelta già presa per la galleria design con `MAX_PHOTOS=8` (F36).

**(c) Classe Storage** `product-photos/<slug>/<uuid>.<ext>`, 1024w — stesso
budget della galleria lifestyle F36 (modale ~420px + lightbox full-screen,
×2 DPR + margine), distinta dalla classe `products` (256px, thumb catalogo)
che resta invariata.

**(d) Serie come coppia di colonne `series_no`/`series_en` su `products`**,
non una tabella `product_series`: è un'etichetta di raggruppamento visuale
per la griglia, senza attributi propri né bisogno di riuso cross-prodotto
oltre al testo stesso. Testo pubblico ⇒ doppia colonna `_no`/`_en` (AGENTS
§i18n regola 4). L'ordine delle sezioni deriva dal `products.sort_order` già
gestito in admin (F39): non serve una colonna d'ordine dedicata alla serie.

## Alternative scartate

- **Due colonne foto su `products`** (`photo_1`, `photo_2`): niente
  `sort_order` per riga, cancellazione di una singola foto scomoda (shift
  manuale), rompe la convenzione "una tabella per collezione ordinabile" già
  usata da `design_images`/`option_categories`/`options`.
- **Tabella lookup `product_series`**: YAGNI — nessun attributo proprio oltre
  al nome, nessuna FK realmente utile (nessun'altra entità referenzia la
  serie), un JOIN in più su ogni lettura del catalogo per un semplice testo
  di raggruppamento.

## Conseguenze

- (+) L'admin gestisce le foto prodotto col CRUD già noto (stesso pattern di
  `design_images`): riordino, upload, cancellazione singola.
- (+) 0 foto ⇒ degrado identico all'attuale (la modale mostra solo `image`,
  come oggi); 0 serie ⇒ il prodotto cade nella sezione finale senza etichetta.
- (−) Nessun vincolo DB sul cap 2: una scrittura fuori dalla server action
  potrebbe superarlo. Accettato — il back-office è l'unico scrittore della
  tabella (RLS `authenticated all`).
- (−) Serie non normalizzata: un refuso in admin crea una sezione in più
  invece di raggrupparsi con le altre. Mitigato da un `<datalist>` dei valori
  di serie già in uso (Task 9 di questa card), non impedito a livello di
  schema.
