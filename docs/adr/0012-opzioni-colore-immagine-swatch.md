# ADR 0012 — Le opzioni colore portano un'immagine swatch (asset reali nello step 2)

**Stato**: Accepted · 2026-06-08 · Implementato in F15

## Contesto

Lo step 2 originale mostra, per ogni colore, una **thumbnail texturizzata reale** (foto
della glassa): asset curati su cui il cliente ha investito, da usare così come sono.
All'import 1.5 erano stati scartati a favore dell'`hex`; in F13 approssimati con grana
procedurale. Decisione del proprietario (2026-06-08): recuperare gli originali. Ostacolo: il
CHECK `num_nonnulls(image, hex) = 1` impediva a un'opzione colore di avere swatch **e** hex.

## Decisione

1. **Tre asset per opzione colore**: `image` (swatch reale, display), `hex` (semantico,
   placeholder/fallback, sempre presente per `kind=color`), `layer_image` (preview, ADR 0010).
2. **CHECK rilassato** a `num_nonnulls(image, hex) >= 1`; la corrispondenza col `kind` resta
   a carico dell'app.
3. **Rendering swatch** (DESIGN-SYSTEM §3.10), in priorità: (a) `image` reale; (b) `hex` +
   grana procedurale F13 (fallback); (c) flat `hex`.
4. **Re-import** delle swatch originali in `options.image`, idempotente.
5. **Back-office** (F10): per opzione si impostano `image`, `hex`, `layer_image`.

## Note di implementazione (F15)

- Il rilassamento del CHECK era **già** applicato dalla migration `0005_layer_image.sql`
  (`options_image_or_hex_check`): nessuna nuova migration.
- Sorgente swatch: la collezione legacy `palettes` (21 webp, chiave = hex) copre 1:1 i 21
  colori distinti. Backfill `scripts/backfill-swatch-images.ts` → `swatches/<hex>.png` (dedup),
  poi `options.image` per le 261 opzioni colore. **0 colori senza foto.**

## Conseguenze

- (+) Step 2 identico all'originale; placeholder automatico per nuovi colori; un solo modello.
- (−) Re-import asset (peso su Storage); più campi nel CRUD asset (F10).

## Relazioni

- **Supera** la resa procedurale F13 (DESIGN-SYSTEM §3.10), che resta come fallback.
- **Rilassa** il CHECK di ADR 0004 / `0001_schema`.
