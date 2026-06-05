# Mappa compositing legacy (Passo 0 di F02) — estratta da configurator-squarespace.html

Fonte: `getPreviewImagesForCode(fullCode)` nello snapshot. **Non ancora portata a codice TS:
il Passo 0 si è fermato per asset mancanti (vedi report in chat / PR).**

## Modello di compositing del sito live

```
preview = [
  { src: plates[pIdx],  blend: "normal"   },   ← FOTO del piatto (base)
  …designLayers (per design, in quest'ordine):
]
```

| Design (modeChar) | Layer multiply, in ordine | Note |
|---|---|---|
| Striper (`S`) | stripes[i] | 1 sola categoria |
| Juletre (`J`) | treeBase[0] · treePynt[i] · treeKant[j] | treeBase fisso |
| Krabbe (`K`) | crabLine[0] · crabColors[i] · crabKanter[j] | crabLine fisso |
| Blomster 1 (`B1`) | flor1Detaljer[i] · flor1Kanter[j] | |
| Blomster 2 (`B2`) | flor2Blader[i] · flor2Kanter[j] | |
| Amalfi (`AD`) | adMain[i2] · adDots[i3] · adPlants[i4] · adInner[i5] · poi **adShape[i1] blend NORMAL** | shape sopra tutto, non multiply |

**Punto chiave**: ogni scelta "colore" del legacy è un **PNG pre-colorato** della rispettiva
raccolta, moltiplicato sulla foto del piatto. Il multiply NON applica un hex a un pattern
neutro: l'hex nel filename è solo metadato. La ricolorazione live via hex (modello attuale
options kind=color) non può riprodurre la preview senza questi PNG.

## syncColors (lock farger) — verificato

`syncColors` gestisce SOLO la coppia crabColors ↔ crabKanter (hard-coded), match per hex
estratto dal filename. **Nessun lock per Juletre nel legacy**: l'aspettativa "pynt↔kanter"
nella card F02 non trova riscontro nello snapshot. Il DB attuale (sync_group solo su
krabbe) è quindi FEDELE al legacy.

## Codice configurazione legacy (riferimento, ADR 0002 prevede formato nuovo)

`MK-<mode>-<P><n1>[-n2[-n3-n4-n5]][-Q<qty>]` dove `P` = lettera piatto (A=0…),
indici 1-based per le opzioni. Esempio visto live: `MK–B1–A1–1–Q1`.
