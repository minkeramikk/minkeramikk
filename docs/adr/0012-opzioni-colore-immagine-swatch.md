# 0012 — Le opzioni colore portano un'immagine swatch (asset reali nello step 2)

Status: Accepted (2026-06-08)

## Contesto

Lo step 2 del sito originale mostra, per ogni colore, una **thumbnail texturizzata
reale** (foto della glassa) nella griglia, più — su hover — il pattern di quella categoria
in quel colore. Sono asset curati su cui il cliente ha investito: vanno usati così come
sono, non approssimati.

All'import 1.5 le swatch images (collezione `hovering-colors` e le collezioni colore per
categoria) erano state **scartate**, sostituite dall'`hex`; in F13 erano state approssimate
con una **grana procedurale**. Decisione del proprietario (2026-06-08): si recuperano gli
asset originali.

Vincolo attuale (ADR 0004 / `0001_schema`): `CHECK num_nonnulls(image, hex) = 1` — una
opzione può avere O `image` O `hex`, non entrambi. Questo impedisce a un'opzione colore di
portare insieme la foto-swatch e l'hex.

## Decisione

1. **Tre asset per opzione colore**: `image` (thumbnail swatch reale, per il display),
   `hex` (colore semantico — placeholder/fallback, sempre presente per `kind=color`),
   `layer_image` (pattern di preview, ADR 0010). Per `kind=image` (animali) resta `image`
   obbligatorio + `layer_image`; `hex` opzionale.
2. **CHECK rilassato** da `num_nonnulls(image, hex) = 1` a `num_nonnulls(image, hex) >= 1`
   (almeno uno). La corrispondenza col `kind` della categoria resta a carico dell'app
   (`kind=color` → `hex` obbligatorio; `kind=image` → `image` obbligatorio). Migration che
   sostituisce il vincolo — sicura, è un rilassamento (nessuna riga esistente lo viola).
3. **Rendering swatch** (DESIGN-SYSTEM §3.10), in priorità: (a) `image` reale se presente →
   la foto della glassa; (b) altrimenti `hex` + **grana procedurale** (il lavoro di F13
   resta, come **placeholder/fallback**); (c) flat `hex` come ultimo fallback. Così un colore
   senza foto è comunque presentabile, e quando l'admin carica la foto si usa quella.
4. **Re-import**: recuperare le swatch images originali (`hovering-colors` + collezioni
   colore per categoria) in `options.image`. Idempotente (come l'import 1.5 / il backfill 0006).
5. **Back-office** (F10): per ogni opzione si potranno impostare `image` (swatch), `hex`
   (placeholder), `layer_image` (preview). Lo schema lo supporta dopo il punto 2.

## Conseguenze

Positive:
- Step 2 identico all'originale con gli asset veri; placeholder automatico per i nuovi
  colori senza foto; un solo modello per import e back-office.
- La grana procedurale di F13 non si butta: diventa il placeholder/fallback.

Negative / costi:
- Migration di rilassamento del CHECK + re-import asset (peso su Storage).
- Le opzioni colore possono ora avere 3 asset: più campi nel CRUD asset (F10).

## Note di implementazione (F15, 2026-06-08)

- **CHECK**: il rilassamento era GIÀ stato applicato dalla migration `0005_layer_image.sql`
  (constraint `options_image_or_hex_check` = `image IS NOT NULL OR hex IS NOT NULL`). Nessuna
  nuova migration: il punto 2 della decisione è soddisfatto a monte.
- **Sorgente swatch**: la collezione legacy `palettes` (21 webp, una per colore, chiave = hex)
  copre 1:1 i 21 colori distinti del catalogo (confermato dal proprietario). `hovering-colors`
  (20) ne copriva 20. Backfill idempotente `scripts/backfill-swatch-images.ts`: una swatch per
  hex caricata su `swatches/<hex>.png` (dedup), poi `options.image` impostato per le 261 opzioni
  colore. 0 colori senza foto.
- **Rendering**: lo Swatch mostra `options.image` (foto vera); la grana procedurale F13 resta
  solo come placeholder per colori senza foto; flat `hex` ultimo fallback. Le icone `kind=image`
  mostrano l'arte originale su tile (`--muted`/`--primary` se selezionato), niente `mask-image`.

## Relazioni

- **Supera** la resa procedurale dello swatch (DESIGN-SYSTEM §3.10 "texture glassa" di F13),
  che resta come fallback.
- **Rilassa** il `CHECK` introdotto con ADR 0004 / `0001_schema`.
- Implementata insieme a **F15** (step 2 fedele all'originale).
