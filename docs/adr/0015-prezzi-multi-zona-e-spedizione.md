# ADR 0015 — Prezzi multi-zona e spedizione (zone di spedizione)

**Stato**: Proposed · 2026-06-09 · (change-order, non nel preventivo accettato)

## Contesto

Il gestore chiede due cose nuove:

1. Un **selettore di paese/regione di spedizione** (Norvegia, Europa, …) che mostri **prezzi
   coerenti con la regione**. Non è una conversione di valuta: in Norvegia si vende **a più**
   che in Europa, quindi il prezzo *cambia* in base al selettore, non solo il simbolo di valuta.
2. **Costi di spedizione** che variano **per zona** (es. gratis sopra una soglia; inclusi nel
   prezzo per la Norvegia) **e per contenuto del carrello** (la ceramica è pesante e fragile →
   plausibile a peso).

Vincolo abilitante decisivo: **non c'è pagamento online** (ordine via email + ricontatto, ADR
0002/0005). Prezzo e spedizione sono quindi **indicativi e comunicativi**, non un addebito.
Questo toglie le parti dure (motore IVA in tempo reale, dogane, API corriere a peso, settlement
valuta) e riduce il problema a un modello che il gestore controlla dal back-office.

Base già esistente: Money value object consapevole della valuta (0005), ordini con **istantanea**
di prezzo+valuta, catalogo multi-fornitore (0007).

## Decisione

Un solo concetto: **Zone di spedizione**, gestite dall'admin. Al lancio: **Norvegia (NOK)** ed
**Europa (EUR)**. Ogni zona = `{ nome, valuta, regola di spedizione, nota fiscale (display) }`.

**Prezzo = price book per zona.** Ogni prodotto ha un **prezzo esplicito per zona**, nella valuta
della zona, impostato a mano (NO più caro di EU). Nessuna conversione FX automatica.
*Scartato:* FX sul prezzo base — non sa esprimere né "in NO si vende a più" né "spedizione
inclusa nel prezzo", che sono proprio i casi richiesti.

**Spedizione = policy per zona**, con modalità configurabile:

- `inclusa` — Norvegia: spedizione (e MVA) già dentro il prezzo → mostra "Frakt inkludert".
- `forfait` — importo fisso per la zona.
- `gratis sopra soglia` — sopra X di subtotale → 0, sotto → forfait.
- `a scaglioni di peso` — somma dei pesi dei prodotti in carrello → tabella scaglioni della zona
  (es. 0–2 kg = 200 kr, 2–5 kg = 350 kr…), impostata a mano.
- Il layer "gratis sopra soglia" è applicabile **sopra** qualunque modalità.

**Peso = campo opzionale `peso (g)` per prodotto**, usato **solo** se una zona è in modalità
scaglioni. Così l'MVP può partire `forfait`/`soglia` e aggiungere il peso **senza migrazione**.

**Driver consigliato per la ceramica: il peso.** È l'unità onesta e rispecchia le tariffe reali;
ma resta **indicativo** (scaglioni manuali), non una quotazione live. Modalità più economica per
partire: `forfait` + `gratis sopra soglia`.

**Una sola spedizione per ordine**, sul carrello intero, nella zona scelta — anche se il carrello
mescola fornitori (0007). Il PDF di produzione resta **splittato per laboratorio**, ma al cliente
arriva **un'unica voce spedizione** (il gestore consolida la spedizione).

**UX.** Selettore regione nell'header, **persistito** (cookie), default dalla lingua del
browser/geo. Cambiare zona **ri-prezza** catalogo + carrello dal price book della zona e
**ricalcola** la spedizione. Il carrello resta **mono-valuta** (0005): nessun mix di valute, si
ricalcola tutto sulla zona attiva.

**Snapshot ordine.** Zona, valuta, voce spedizione e modalità vengono **salvate nell'ordine** e
mostrate in: email di conferma al cliente, notifica all'admin, PDF laboratorio.

**Fisco = solo display, nessun calcolo.** Nota per zona ("Priser inkl. MVA" per NO; "Eksport —
lokale avgifter kan tilkomme" per EU). Nessun motore IVA: il numero giusto è già nel price book
della zona.

## Conseguenze

- (+) Copre **tutte** le richieste (prezzo per regione, spedizione inclusa/forfait/soglia/peso)
  con un unico modello che il gestore controlla.
- (+) Riusa Money VO e snapshot ordini; il modello a modalità consente un **MVP economico**
  (forfait/soglia) con upgrade al peso senza cambiare schema.
- (−) **Scope nuovo**, non nel preventivo accettato: dati (zone, price book, policy, peso opz.),
  CRUD admin, selettore, ri-prezzatura del carrello, voce spedizione in ordine/email/PDF, test
  → **change-order** (vedi preventivo).
- (−) Data-entry: prezzo per prodotto × zona (piccolo: ~8×2) e, se a peso, peso prodotti +
  scaglioni per zona.
- (−) Carrello mono-valuta: cambio zona = ricalcolo (gestito), non conversione live.
- (?) **Modalità spedizione al lancio**: peso (consigliato, onesto per ceramica) vs forfait/soglia
  (MVP più economico) — da confermare col gestore.
- (?) Default del selettore: lingua browser vs IP-geo.
- (?) "Resto del mondo" come terza zona — fuori dal lancio.

## Relazioni

- **Estende** ADR 0005 (Money/valuta) e 0004 (modello catalogo) con il prezzo per zona.
- **Si coordina** con ADR 0007 (multi-fornitore): spedizione unica al cliente nonostante lo split
  per laboratorio.
- **Genererà** una o più flow card (NON in questo ADR) e una **voce di change-order** nel
  Preventivo (rev. 6).
