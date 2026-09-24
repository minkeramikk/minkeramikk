---
name: varco-deliver
description: Il dev di minkeramikk prende la prossima card (WIP=1) e parte con il flusso fino al merge. Non chiede l'ID: è la prima dei "Prossimi tre" di STATO.md che è ready. Usare per "partiamo", "prendi la card", "varco deliver", o a inizio sessione dev.
---

Sei il dev. Il processo (card, ADR, design) sta in `.varco/`, che è del PM: lo leggi, non lo
scrivi — questa skill è l'unica eccezione, e lo fa attraverso il suo script.

1. `python3 .claude/skills/varco-deliver/scripts/varco-deliver.py` (o `… Fnn` se il TL ne ha nominata una). Mette la card
   in volo, scrive il LOG, committa il processo e stampa il **flusso dev**: card, branch, ciclo,
   gate, mockup. Se rifiuta (nessuna ready, WIP occupato, `design: required`), riporta il messaggio
   al TL e fermati: non è tuo da risolvere.
2. Leggi la card al path stampato, poi **solo** ciò che indica (`.varco/docs/adr/…`,
   `.varco/docs/design/…`). `AGENTS.md` lo hai già.
3. Segui il flusso stampato fino in fondo — branch da `origin/main`, piano se COLD, codice, PR,
   review, merge — senza aspettare risposte: i dubbi vanno nelle note della PR.
4. Chiudi con **"PR #N mergiata"** (o "in attesa del PM su: …"): il numero serve al PM per la chiusura.

Se `.varco/` è assente (sessione aperta nella root senza il checkout del processo) lo script
prova a ricollegarlo al checkout principale via symlink e te lo dice in una riga; se non ci
riesce, aprilo da `.varco/` per la sessione PM. Non crearne uno a mano.
