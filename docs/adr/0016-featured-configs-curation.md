# ADR 0016 — Featured configs: curation by config code, thumb pre-composta

**Stato**: Accepted · 2026-06-12

## Contesto

F28 ("Popular designs") chiede una vetrina in home (step 1) di configurazioni
in evidenza, curate dall'admin. Il sito ha già due forme di "link che ricarica
uno stato": il config code (ADR 0011, `?code=` → step 2) e il set param CA-3
(`?step=3&set=` → step 3 col basket). Forze in gioco: la home è il percorso
più caldo del sito (lezione F26: niente compositing multi-layer client-side
lì), il catalogo cambia (design disattivati, prodotti nascosti), e non
vogliamo né analytics né infrastruttura nuova per una feature di curation.

## Decisione

1. **Una featured = un link del configuratore, curato.** Tabella
   `featured_configs` (migration 0010): `kind ∈ {design, set}`, `payload` =
   config code o set param (testo, MAI prezzi o id interni), label NO/EN
   opzionali con fallback, `thumb_image`, `sort_order`. Max 10: gate
   app-side nella server action (messaggio chiaro), niente trigger.
2. **Il catalogo resta la fonte di verità.** Il payload si ri-valida:
   severo all'ADD (un set con righe irrisolvibili non entra in vetrina),
   tollerante a lettura (una featured che non risolve più sparisce dalla
   home e resta in admin con badge "invalid" + motivo). La home non mostra
   mai roba rotta; l'admin vede sempre perché.
3. **Thumb pre-composta al salvataggio** (riuso `compose-plate`/sharp di
   F08): una singola immagine `featured/<id>.webp` (~512px) per card —
   per i set, la composizione della PRIMA riga + badge "Sett · N deler".
   Alternative scartate: impilare i layer client-side (≈50 immagini in
   home, contro la lezione F26); rigenerare le thumb al cambio asset
   (complessità non ripagata: refresh = ri-salvataggio, documentato in
   admin); collage multi-piatto per i set (costo > beneficio).
4. **Atterraggi senza logica nuova**: `design` → `?code=` (decode-once F04),
   `set` → `?step=3&set=` (atterraggio CA-3 con auto-load/banner 3 vie).

## Conseguenze

- (+) Home: 1 immagine per card, zero query extra su cache hit (tag
  `featured`), zero rami nuovi negli atterraggi.
- (+) Curation senza schema legato al catalogo: il payload è testo, la
  validazione vive nel codec (F04/CA-3) già unit-testato.
- (−) Thumb stale se l'admin cambia gli asset di un design: accettato,
  refresh = re-save della featured (documentato nella UI admin).
- (−) `payload` UNIQUE è case-sensitive: due input equivalenti normalizzati
  diversamente potrebbero duplicare — mitigato normalizzando nel parser
  prima dell'insert.
- (?) Se un domani le "popular" diventeranno data-driven (CA-5/tracking),
  la tabella può ospitare l'ordinamento automatico senza cambiare schema.
