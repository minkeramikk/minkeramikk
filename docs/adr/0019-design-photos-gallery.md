# ADR 0019 — Galleria foto lifestyle per design

**Stato**: Accepted · 2026-07-17

## Contesto

Feedback Alessio: allo step 2 del configuratore (scelta design) manca un modo per
mostrare foto reali "in ambiente" della ceramica finita — oggi il design ha solo
`preview_image` (una singola immagine di anteprima, ADR 0004). Serve una galleria
di più foto per design (filmstrip), riusabile senza toccare il modello di compositing
esistente (ADR di riferimento: tecnica `<img>` + `mix-blend-mode: multiply`, invariata).

## Decisione

Tabella dedicata **`design_images`** (id, `design_id` FK → designs, `image`, `sort_order`),
una riga per foto, invece di espandere `designs` con colonne multiple o un array.

- **Storage owned**: i file vivono sotto il prefisso `design-photos/<slug>/<uuid>.<ext>`
  nel bucket `assets`, classe F26 (1024w) — stesso pattern degli altri asset gestiti
  dal back-office.
- **Nessuna colonna `active`**: a differenza del catalogo (designs/products), qui non
  serve nascondere singole foto — si cancella la riga. Tutte le righe sono quindi
  pubblicamente leggibili.
- **Niente lightbox in v1**: la galleria è solo filmstrip/strip d'anteprima allo step 2;
  l'ingrandimento a schermo intero è fuori scope, valutabile in un change-order futuro
  se richiesto.
- **RLS**: SELECT pubblico (serve al configuratore anon, come `design_products`/
  `supplier_colors`), scrittura solo `authenticated` (pattern `0002_rls.sql`).
  ON DELETE CASCADE su `design_id`: le foto non hanno senso senza il design.

**Alternativa scartata — colonna array/jsonb su `designs`** (es. `photo_paths text[]`).
Rotta perché: niente `sort_order` per riga, niente FK verso lo Storage path pulito,
riordino/cancellazione singola più scomodi lato back-office, e rompe la convenzione
"una tabella per collezione ordinabile" già usata da `option_categories`/`options`.

## Conseguenze

- (+) Step 2 del configuratore può mostrare foto reali della ceramica finita senza
  toccare `designs` né il compositing esistente.
- (+) Pattern RLS e Storage identico agli altri asset owned (F26): nessuna eccezione
  da documentare.
- (+) Riordino/aggiunta/rimozione foto singole è un CRUD semplice sulla tabella,
  coerente col resto del back-office.
- (−) Nessun limite applicativo al numero di foto per design: un design con troppe
  foto rallenta lo scroll del filmstrip — gestibile a UX se emerge in pratica.
- (?) Se servirà un lightbox o riordino drag-and-drop lato back-office, sarà un
  change-order successivo (non richiesto in questo giro, ADR 0019 resta scope-chiuso
  su schema + RLS + Storage).
