# F15 — Step 2 IDENTICO all'originale: asset reali + griglia verticale

**Branch:** `flow/f15-step2-real-assets` → `main` · **dep:** F02 ✅ F13 ✅ · **ADR 0012**
**Non-merge:** review agent prima del merge.

## Cosa fa

Lo step 2 ora è fedele all'originale: ogni categoria mostra TUTTE le opzioni in una
griglia che va a capo (niente carosello/scroller orizzontale); le swatch colore sono le
**foto-glassa reali** del sito originale; le icone animali sono l'**arte originale** su tile
(non più silhouette monocromatiche).

## Passo 0 — dati/asset (STOP-gate risolto)

- **CHECK già rilassato**: `0005_layer_image.sql` aveva già sostituito `num_nonnulls(image,hex)=1`
  con `image IS NOT NULL OR hex IS NOT NULL` (constraint `options_image_or_hex_check`). Un'opzione
  colore può quindi portare `image`+`hex`+`layer_image` insieme. **Nessuna nuova migration** (ADR 0012, nota di implementazione).
- **Sorgente swatch confermata dal proprietario**: collezione legacy `palettes` (21 webp, una per
  colore, chiave = hex), **copertura 1:1** dei 21 colori distinti del catalogo. (`hovering-colors`
  ne copriva 20.)
- **Backfill idempotente** `scripts/backfill-swatch-images.ts` (`npm run backfill:swatches`): carica
  una swatch per hex su `swatches/<hex>.png` (dedup) e imposta `options.image` per ogni opzione
  colore con quell'hex. Eseguito sul DB live → **21 swatch caricate, 261 opzioni colore con `image`,
  0 mancanti**; re-run converge (idempotente). Collegato anche al full-import per i re-import futuri.
- Tipi invariati (la colonna `image` esisteva già; nessun cambio schema).

## Acceptance criteria

- **AC1** — Tutte le opzioni di ogni categoria in griglia a capo, **nessuno scroller-x**, a 390 e
  1280; navigazione da tastiera (radiogroup, frecce) invariata. *(e2e f15: count 20, grid non-scroller, no page overflow, ArrowRight seleziona)*
- **AC2** — Swatch colore = foto-glassa reale (`options.image` → `/swatches/<hex>.png`); colore senza
  foto → placeholder grana procedurale (F13); flat `hex` ultimo fallback. *(e2e: swatch-photo src `/swatches/`)*
- **AC3** — Icone `kind=image`: arte originale su tile (`--muted`, selezionata `--primary`), leggibili
  in entrambi gli stati; **nessun `mask-image`/currentColor residuo**. *(e2e: img src `animal/`, maskImage none)*
- **AC4** — Hover-preview F13 (pattern in quel colore) invariato; config code, preview compositing,
  color-lock senza regressioni. *(e2e f13 AC3/AC4/AC6 verdi; f15 AC4 recompose multiply)*
- **AC5** — DB: un'opzione colore porta `image`+`hex`+`layer_image` (CHECK rilassato) → pronto per il
  CRUD asset del back-office (F10).
- **AC6** (ex-F17, ricongiunto in F15 su richiesta) — la **preview resta visibile mentre la lista lunga
  scorre**: desktop la colonna preview è `sticky`; mobile la preview si aggancia in alto (`sticky top-0`)
  e **collassa a una thumbnail compatta** (140px) una volta superata la sua posizione naturale —
  rilevata con un sentinel a altezza 0 + `IntersectionObserver` (niente scroll-math). La transizione di
  collasso rispetta `prefers-reduced-motion`. Selezionare un'opzione da scrollati aggiorna la preview
  ancora a schermo. *(e2e f15 AC5 a 390+1280: preview pinnata dopo scroll, collasso mobile, recompose da scrollato)*

## Decisioni / note

- **Backfill mirato** invece di full re-import: non ri-scrapa né ri-wipa le opzioni (più sicuro/veloce),
  riusa le URL CDN già in `catalog.json`. La logica pura è unit-testata; è anche agganciata al full
  import per coerenza futura.
- **Swatch dedup per hex**: 21 upload condivisi (`swatches/<hex>.png`) referenziati dalle 261 opzioni —
  un colore = una foto, indipendente dalla categoria.
- **Rimosso** `OptionCarousel` (embla) dallo step 2. La dipendenza `embla-carousel-react` resta in
  `package.json` ma non è più importata (rimozione rimandabile a un cleanup; non incide sul bundle).

## DoD (Node 24 / `npm ci` pulito)

- `eslint` — pulito (exit 0)
- `vitest run` — **84 passed (10 file)**, incl. 7 nuovi unit del backfill (mapping hex→swatch, path,
  conteggi, idempotenza, errore upload)
- `next build` — OK, **31 route**
- Playwright — griglia + swatch reali + **sticky/collapse preview** (f15 AC1–AC5 a 390+1280, desktop+mobile); regressione F01–F05/F13/F14 intatta (incl. F14 preview pixel-identico al top)
- e2e F13 aggiornati: AC1/AC2 ora asseriscono gli asset reali (prima: grana/mask)

## Evidenza

`docs/evidence/f15/` — `f15-colors-{390,1280}.png` (swatch glassa reali in griglia),
`f15-animals-{390,1280}.png` (arte animale su tile), `f15-sticky-{390,1280}.png` (preview
pinnata mentre la lista scorre; mobile collassata a thumbnail).

## File principali

- dati: `scripts/backfill-swatch-images.ts` (+ `.test.ts`), `scripts/import-squarespace.ts`, `package.json`, `vitest.config.ts`
- UI: `src/components/ui-domain/swatch.tsx`, `option-card.tsx`, `src/app/[locale]/(public)/configurator/configurator-client.tsx` (rimosso `option-carousel.tsx`)
- test/evidenza: `e2e/f15.spec.ts`, `e2e/f13.spec.ts`, `e2e/evidence.spec.ts`, `docs/evidence/f15/*`
- doc: `docs/adr/0012-opzioni-colore-immagine-swatch.md` (nota implementazione)

## Push / apertura PR (manuale)

```bash
git push -u origin flow/f15-step2-real-assets
gh pr create --base main --head flow/f15-step2-real-assets \
  --title "F15 — Step 2 IDENTICO all'originale: asset reali + griglia verticale" --body-file PR-F15-body.md
```
