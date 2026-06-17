# ADR 0015 — Prezzi multi-zona e spedizione (zone di spedizione)

**Stato**: Proposed · 2026-06-09 — change-order F20, **parcheggiato 2026-06-16**: deciso di
restare **solo NOK** per ora, la feature non è stata costruita. Resta come progetto pronto se
il multi-zona tornerà in scope.

## Contesto

Il gestore chiedeva: (1) un **selettore di regione** (Norvegia, Europa…) con **prezzi per
regione** (non FX: in NO si vende a più che in EU, cambia il prezzo); (2) **spedizione per zona**
e per contenuto carrello (la ceramica è pesante → plausibile a peso). Vincolo abilitante: **niente
pagamento online** (ordine via email, ADR 0002/0005) → prezzo e spedizione sono **indicativi**,
non un addebito, il che elimina IVA live, dogane e API corriere. Base esistente: Money VO (0005),
snapshot ordini, multi-fornitore (0007).

## Decisione (proposta, non implementata)

Un solo concetto: **Zone di spedizione** gestite dall'admin. Al lancio Norvegia (NOK) ed Europa
(EUR). Ogni zona = `{ nome, valuta, regola spedizione, nota fiscale display }`.

- **Prezzo = price book per zona**: prezzo esplicito per prodotto × zona, valuta della zona, a
  mano. Nessun FX (non saprebbe esprimere "in NO si vende a più" né "spedizione inclusa").
- **Spedizione = policy per zona**: `inclusa` / `forfait` / `gratis sopra soglia` (layer sopra
  qualunque modalità) / `a scaglioni di peso`. **Peso** = campo opzionale `peso (g)` per prodotto,
  usato solo in modalità scaglioni → l'MVP parte forfait/soglia e aggiunge il peso senza migrazione.
- **Una sola spedizione per ordine** sul carrello intero (anche misto fornitori); il PDF resta
  splittato per laboratorio. **Carrello mono-valuta** (0005): cambio zona = ri-prezzatura, non FX.
- **Selettore regione** in header, persistito (cookie), default da lingua/geo.
- **Snapshot ordine**: zona, valuta, voce spedizione salvate e mostrate in email/notifica/PDF.
- **Fisco = solo display** (nota per zona), nessun motore IVA.

## Conseguenze

- (+) Copre tutte le richieste con un modello che il gestore controlla; riusa Money VO e snapshot; MVP economico.
- (−) **Scope nuovo** fuori preventivo → change-order; data-entry prezzo per prodotto × zona.
- (?) Modalità al lancio (peso vs forfait/soglia); default selettore (lingua vs geo); terza zona "resto del mondo".

## Relazioni

- **Estende** ADR 0005 e 0004 col prezzo per zona; **si coordina** con 0007 (spedizione unica vs split PDF).
- Avrebbe generato flow card + voce change-order (Preventivo rev. 6). **Parcheggiata** (vedi STATO).
