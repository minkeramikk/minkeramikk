# ADR 0016 — Featured configs: curation by config code, thumb pre-composta

**Stato**: Accepted · 2026-06-12

## Contesto

F28 ("Popular designs") chiede una vetrina in home (step 1) di configurazioni curate dall'admin.
Il sito ha già due "link che ricaricano uno stato": config code (ADR 0011, `?code=` → step 2) e
set param CA-3 (`?step=3&set=` → step 3). Forze: la home è il path più caldo (lezione F26: niente
compositing multi-layer client-side lì), il catalogo cambia, e non si vuole né analytics né
infrastruttura nuova per una curation.

## Decisione

1. **Una featured = un link del configuratore, curato.** Tabella `featured_configs` (migration
   0010): `kind ∈ {design, set}`, `payload` = config code o set param (**testo**, mai prezzi o id
   interni), label NO/EN opzionali, `thumb_image`, `sort_order`. **Max 10**: gate app-side nella
   server action, niente trigger.
2. **Il catalogo resta la fonte di verità.** Payload ri-validato: severo all'ADD (un set
   irrisolvibile non entra), tollerante a lettura (una featured che non risolve più sparisce dalla
   home e resta in admin con badge "invalid" + motivo).
3. **Thumb pre-composta al salvataggio** (riuso `compose-plate`/sharp di F08): una `featured/<id>.webp`
   (~512px) per card; per i set, prima riga + badge "Sett · N deler". Scartate: layer client-side
   (lezione F26); rigenerazione al cambio asset (refresh = re-save); collage multi-piatto.
4. **Atterraggi senza logica nuova**: `design` → `?code=` (decode-once F04); `set` → `?step=3&set=` (CA-3).

## Conseguenze

- (+) Home: 1 immagine per card, zero query extra su cache hit (tag `featured`), zero rami nuovi negli atterraggi.
- (−) Thumb stale se l'admin cambia gli asset: accettato, refresh = re-save (documentato in UI admin).
- (−) `payload` UNIQUE case-sensitive → normalizzazione nel parser prima dell'insert.
- (?) "Popular" data-driven futuro (CA-5/tracking): la tabella può ospitare l'ordinamento automatico senza cambiare schema.
