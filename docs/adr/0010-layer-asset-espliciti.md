# ADR 0010 — Gli asset di compositing sono dati espliciti (`options.layer_image`)

**Stato**: Accepted · 2026-06-06 · Corregge un'assunzione di ADR 0004 / import 1.5

## Contesto

Il Passo 0 di F02 ha dimostrato che il legacy NON ricolora pattern neutri con un hex:
compone la foto del piatto (blend normal) con **PNG pre-colorati** in multiply (~255 file),
più le sagome `/animals-` (overlay normal) mai importate. L'hex nei filename è solo metadato.
L'import 1.5 aveva scartato asset indispensabili e lo schema non aveva dove referenziarli.
Display e compositing sono concern diversi (la card usa la thumb, la preview usa la sagoma).

## Decisione

- Nuova colonna **`options.layer_image`** (text, nullable): path Storage dell'asset di
  compositing. `image` resta il display (thumb), `hex` resta lo swatch. `layer_image` è
  ortogonale al `kind`.
- CHECK (migration additiva): `kind=image → image NOT NULL` · `kind=color → hex NOT NULL`.
- **Import 1.5-bis**: carica le raccolte pre-colorate e le sagome `/animals-`, popolando
  `layer_image`; path `designs/{slug}/{category}/{option-slug}.png` (lo slug, **non** l'hex:
  i path non codificano dati). Idempotente.
- La composizione resta multiply su foto piatto (ADR 0002): cambia solo la *provenienza* del
  colore (PNG pre-colorato, non tint runtime).

## Alternative scartate

- *Filename `{hex}.png`*: ricrea l'antipattern dati-nei-filename che il progetto elimina.
- *Ricolorazione vera (master neutro × hex)*: i master non esistono; lavoro grafico fuori preventivo.

## Conseguenze

- (+) Riferimenti espliciti e interrogabili; display/compositing separati.
- (−) ~255 file in più su Storage (free tier ok) e un import da rifare.
- Nota: `syncColors` legacy è hard-coded sulla sola coppia crab — il DB (sync_group solo su Krabbe) è fedele.
