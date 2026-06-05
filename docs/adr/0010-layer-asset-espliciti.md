# ADR 0010 — Gli asset di compositing sono dati espliciti (`options.layer_image`)

**Stato**: Accepted · 2026-06-06 · Corregge un'assunzione di ADR 0004 / import 1.5

## Contesto

Il Passo 0 di F02 ha dimostrato che il legacy NON ricolora pattern neutri con un hex:
compone la foto del piatto (blend normal) con **PNG pre-colorati** in multiply, uno per
ogni variante colore delle raccolte (~255 file), più le sagome `/animals-` (overlay
normal) mai importate. L'hex nei filename è solo metadato dello swatch. L'import 1.5
aveva quindi scartato asset indispensabili, e lo schema non aveva dove referenziarli
(CHECK one-of image/hex). Inoltre Amalfi mostra che display e compositing sono concern
diversi: la card usa la thumb (`animals-preview`), la preview usa la sagoma (`/animals-`).

## Decisione

- Nuova colonna **`options.layer_image`** (text, nullable): path Storage dell'asset di
  compositing. `image` resta l'asset di *visualizzazione* (thumb nelle OptionCard),
  `hex` resta lo swatch.
- CHECK aggiornato (migration additiva): `kind=image → image IS NOT NULL` ·
  `kind=color → hex IS NOT NULL`. `layer_image` è ortogonale al kind.
- **Import esteso (1.5-bis)**: scaricare e caricare le raccolte pre-colorate
  (floreal1/2, crabcolors, crab-kanter, stripes, julepynt, juletre-kanter,
  animals-maincolor/dotter/plantscolor/innercircle) e le sagome `/animals-`,
  popolando `layer_image`; path `designs/{slug}/{category}/{option-slug}.png`
  (lo slug dell'opzione, NON l'hex: i path non codificano dati). Idempotente.
- La composizione resta multiply su foto piatto (tecnica legacy, ADR 0002) — cambia
  solo la *provenienza* del colore: dal PNG pre-colorato, non da un tint runtime.

## Alternative scartate

- *Convenzione filename `{hex}.png`*: ricrea l'antipattern dati-nei-filename del sito
  legacy che questo progetto esiste per eliminare; fragile ai rinomini in F10.
- *Ricolorazione vera (master neutro × hex)*: i master non esistono; lavoro grafico
  fuori dal preventivo ("asset riusati così come sono"). Possibile evoluzione futura.

## Conseguenze

- (+) Riferimenti espliciti e interrogabili; F10 (upload admin) ha colonne chiare.
- (+) Display/compositing separati: nessun compromesso sulle thumb degli animali.
- (−) ~255 file in più su Storage (~free tier ok) e un giro di import da rifare.
- Nota a margine: verificato che `syncColors` legacy è hard-coded sulla sola coppia
  crab — il DB (sync_group solo su Krabbe) è fedele; l'aspettativa su Juletre nella
  card F02 era errata ed è stata corretta.
