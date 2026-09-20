---
name: varco-plan
description: Il contratto Varco attorno al piano di una card COLD di minkeramikk — le regole di consegna date, la testata che il PM rivede (terreno, decisioni, domande, copertura AC), poi il corpo dei task con Superpowers `writing-plans` se presente. Un file solo, poi stop per la review PM. Usare per "scrivi il piano", "piano per Fnn", "varco plan", e sempre in ciclo COLD prima di toccare codice.
---

Sei il dev agent in ciclo COLD. Il piano ha **due lettori**: `pm-reviewer` rivede la testata (e il
PM umano solo le decisioni che spettano a lui); i subagent eseguono i task. Non cercare le regole nella storia
delle PR: sono in §1, date. Non fare domande al PM in chat: vanno nella testata.

## 1. Regole di consegna — date, non da scoprire

- **Agenti**: ogni task è di `backend` o `frontend` (`.opencode/agents/`), per nome; ordine
  naturale backend → frontend, i ports sono il contratto. `reviewer` non scrive.
- **Evidenza per livello di AC**: `[unit]` → test file nominato · `[permessi]` → test di permessi
  negativo nominato (RLS, voter: quello dello stack, `AGENTS.md` §Stack) · `[evidenza]` → screenshot 390/768/1280 **prodotti dal job `e2e` della CI** (artifact
  `evidence-<sha>`), scaricati e incollati nel **body della PR** — mai cartelle nel repo ·
  `[manuale]` → una riga di istruzione per il PM nel body.
- **Test**: unit sul dominio nello stile del file d'esempio indicato in `AGENTS.md` (§Consegna);
  permessi negativo dove si toccano dati protetti; i comandi di verifica di `AGENTS.md` §Stack
  (install pulito, lint, build, unit) verdi prima della PR. **Gli e2e non li lanci e non li scrivi**: la spec la tocchi solo se la card lo dice.
- **PR** a flusso finito con `gh pr create`, body dal template; dubbi nelle "Note per il
  reviewer"; non aspetti risposte. Commit piccoli in inglese; scorciatoie marcate `ponytail:`.
- **Dati e casi limite**: quelli che contano sono nella card (Vincoli) o negli ADR che indica.
  Un caso che la card non decide è una **domanda** in testata, non una scelta silenziosa.

## 2. Leggi

La card (nel prompt del TL, salvata in `.plans/fnn.card.md`), gli ADR e i mockup che **lei** indica, `AGENTS.md` e
gli `AGENTS.md` di zona, il codice che i task toccheranno (ports, migration, un test d'esempio).

## 3. Un file solo, con la testata Varco in cima

Con OpenCode: il piano lo scrive l'agent `plan` (read-only) nel file `.plans/fNN-nome.md`;
**prima** dei task, il file porta questa testata. Senza agent plan: lo stesso file, con i task
in forma compatta (tocca · fa · copre · verifica), senza codice. Mai due piani.

```
# Fnn · Titolo — piano
Stato: in attesa di review PM · Card: <path> · Branch: flow/fNN-nome · Agenti: backend, frontend

## 0. Terreno (misurato, non ipotizzato)
- cosa esiste e si tocca (path, ports, tabelle, componenti) · cosa manca, nominato
## 0.1 Decisioni prese scrivendo il piano (il PM conferma o rovescia)
- prima di tutto: le premesse della card che il codice smentisce (file:line) — non una scoperta a metà esecuzione
- scelta · perché · cosa cambia se il PM dice no
## 0.2 Domande (solo ciò che card, ADR e mockup non decidono)
## 0.3 Copertura
| AC | livello | task | verifica (il fatto) |     ← ogni AC della card; un AC senza task = piano incompleto
## 0.4 Consegna: le regole di §1, in tre righe, con i path di questa card
```

Poi i task (`## Task N: titolo — **backend|frontend**`): un task che non copre nessun AC non
esiste (YAGNI vale anche nel piano); niente task "e2e".

## 4. Review del piano — un agente, il PM solo per le eccezioni

Lancia il subagent **`pm-reviewer`** (`.opencode/agents/`, fresco, sola lettura) con i path di card
e piano. Se l'agente non risponde nel progetto, fermati e consegna la testata al PM umano: è lui la
review. Il verdetto:
- `APPROVE` → **prosegui senza aspettare**: esecuzione con subagent OpenCode (un subagent
  per task del piano, contesto fresco: `backend`/`frontend` via task) nello stesso ordine;
  per piani piccolissimi, a mano. TDD, un commit per task. **Senza review per task**: ogni task si chiude con il self-check dell'implementer
  (verifiche di `AGENTS.md` §Stack verdi, brief coperto punto per punto); la review è una sola,
  del `reviewer`, sull'intero branch — è lì che si vedono confini e architettura, non task per
  task. Al PM una riga: "piano approvato da pm-reviewer, N task, eseguo".
- `STOP` con punti meccanici (copertura, agenti, premesse, YAGNI) → correggi il piano e rilancia
  `pm-reviewer` passandogli **la sua lista di punti**: al secondo giro rivede solo quelli, non il
  piano intero. Max 2 giri.
- `STOP` con **"Per il PM"** (domande di §0.2, decisioni di §0.1 che rovesciano la card) → ti
  fermi e consegni al PM **solo quella lista**, non il piano. Riprendi alla sua risposta.

Non tocchi codice prima dell'APPROVE.
