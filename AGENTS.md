<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# minkeramikk.no — Regole di progetto

Rifacimento di minkeramikk.no: configuratore di ceramica personalizzata + finto e-commerce
(ordine via email, nessun pagamento online) + back-office. Cliente singolo, NON multi-tenant.

## Documenti di riferimento (leggere prima di task nuovi)

- `docs/adr/` — **decisioni architetturali (ADR)**: vincolanti; una decisione nuova o un cambio di rotta = nuovo ADR (usare `docs/adr/template.md`, aggiornare l'indice)
- `.varco/docs/stack-tecnologico.md` — architettura, stack, modello dati
- `.varco/docs/theme/DESIGN-SYSTEM.md` — **design system**: token, componenti, shell, mapping shadcn; vincolante per ogni task UI (baseline visiva: `.varco/docs/theme/template-*.html` + `preview-*.png`)
- `.varco/docs/design/mockups/` — mockup delle card (vincolanti dove la card li dichiara)
- `.varco/docs/release/ACCEPTANCE.md` — i journey utente garantiti (protetti, non creati, dagli e2e)
- `.varco/docs/client/` — scope contrattuale: ciò che non è in fornitura NON va implementato senza chiedere
- `.varco/STATO.md` — **stato del progetto (PM-only)**: dove siamo, cosa è in volo, prossimi lavori. È la prima cosa da leggere in una sessione nuova. **Il dev non lo apre e non lo scrive mai** — lo stato che serve viaggia nella card.
- `.varco/docs/delivery/DELIVERY.md` — **board kanban a flussi (PM-only)**: ciclo AC → dev → test → PR (aperta solo a flusso finito, con evidenza) → review agent → merge. WIP=1. Il dev riceve la card dal TL; **board, STATO e card vivono in `.varco/` (repo di processo, ignorata dal prodotto) e non finiscono mai su un branch feature**. Fondamenta storiche in `.varco/docs/archive/`.

## Flow di lavoro (card, non chat)

- La **card** in `.varco/docs/cards/todo/` è l'unica fonte del cosa/perché. La prendi con la skill `varco-deliver` (WIP=1: è la prossima ready). La testata dice **Ciclo** (COLD = piano con `varco-plan` → review `pm-reviewer` → esecuzione; HOT = la card è il piano) e **Gate**: non li scegli tu.
- Branch per card da `origin/release-5` (main è revertato a mano dal TL e non è la base);
  PR sempre verso `release-5`. Commit piccoli in inglese; PR solo a flusso finito (AC come checklist + evidenza + differiti in forma registro); review del `reviewer` (mai chi ha scritto, max 2 giri); **merge su main VIETATO — lo fa solo Daniele con approve umano, a fine release**.
- Manca un'informazione o una decisione di prodotto? **Fermati e chiedi.** Non inventare.
- `.varco/` lo leggi, non lo scrivi — l'unica eccezione è `varco-deliver`, che mette la card in volo. Il tuo stato vive nella PR.

## Harness OpenCode (non deviare senza ADR)

- Sessioni **dev** dalla root del prodotto (OpenCode). Sessioni **PM** da dentro `.varco/`.
- Agenti di progetto in `.opencode/agents/`: `backend` (dominio, contratti, dati, test) · `frontend` (UI sui contratti + design system) · `reviewer` (diff, mai chi ha scritto) · `pm-reviewer` (piano COLD al posto del PM). In COLD ogni task del piano è assegnato per nome a `backend` o `frontend`.
- Piano COLD: agent `plan` (read-only) scrive `.plans/fNN-nome.md` con la testata Varco (`varco-plan`), review `pm-reviewer`, poi esecuzione a subagent. YAGNI sempre; scorciatoie deliberate marcate `ponytail:` e raccolte dal PM alla chiusura.
- Niente Superpowers/Ponytail/Caveman/Conductor in questo repo (deviazione registrata in `.varco/docs/LOG.md`): le regole restano, cambiano solo gli strumenti.

## Auth GitHub a due identità

- Prodotto (org `minkeramikk`): via `.gh-token` in root — **mai committato** (gitignored), permessi 600. Comandi `gh` sul prodotto solo con `GH_TOKEN=$(cat .gh-token)`; il token non entra mai in prompt, output, commit o card.
- Processo (`.varco/`): `gh` di default (account personale). Le due identità non si mescolano.

## Stack (non deviare senza motivo scritto in un ADR)

Next.js 15 (App Router) · React 19 · Tailwind 4 + shadcn/ui · next-intl ·
Supabase (Postgres, Auth, Storage) · Resend · embla-carousel · Vercel

## Regole i18n (vincolanti)

1. Sito pubblico bilingue: norvegese (default, `no`) e inglese (`en`).
2. Route pubbliche SOLO sotto `src/app/[locale]/(public)/…`. URL: `/no/...`, `/en/...`.
   I **path delle route sono SEMPRE in inglese** (`/no/configurator`, non `/no/bygg-din-design`);
   solo le label visibili si traducono.
3. MAI stringhe UI hardcoded nei componenti pubblici: sempre `t()` di next-intl.
   Dizionari: `src/i18n/messages/no.json` e `en.json`, chiavi in inglese, namespaced
   (`configurator.step1.title`). Ogni chiave esiste in ENTRAMBI i file, sempre.
4. Campi testuali del DB visibili al pubblico: doppia colonna `_no` / `_en`.
5. Back-office (`/admin`): SOLO inglese, fuori da `[locale]`, niente next-intl.
6. Testi norvegesi: recuperare dal sito live dove esistono; i nuovi si scrivono in
   inglese e si traducono in norvegese marcandoli `// TODO:nb-review` per la revisione del cliente.

## Convenzioni

- TypeScript strict; componenti server di default, `"use client"` solo se necessario.
- Dati: mai fetch client-side di pagine Squarespace (il vecchio sito faceva scraping — qui i dati vengono SOLO dal DB via server components o route handlers).
- Tema: 3 token semantici (`light`/`dark`/`accent`) da tabella `settings` → CSS variables;
  sfumature SOLO via `color-mix()`, mai colori hardcoded nei componenti (ADR 0008).
  Componenti, varianti e stati: come da `.varco/docs/theme/DESIGN-SYSTEM.md` — un componente
  o variante non documentati lì non si implementano (prima si documenta, poi si codifica).
- Multi-fornitore: ogni design e prodotto appartiene a un supplier; la scelta del design
  aggancia il fornitore, step successivi filtrati su di esso; carrello misto ok (ADR 0007).
- Niente landing/home marketing: la gestisce il cliente altrove con CTA verso questo sito;
  la root pubblica porta al configuratore.
- Configuratore: compositing con `<img>` sovrapposti + `mix-blend-mode: multiply`
  (tecnica validata sul sito attuale). Niente canvas se non strettamente necessario.
- Prezzi: minor units + valuta (`price_cents int` + `currency char(3)`, default NOK). Mai float, mai importi senza valuta. Aritmetica e formattazione SOLO via value object `Money` (`src/lib/money/`), formattazione localizzata con `Intl.NumberFormat`. Vedi ADR 0005.
- Stati ordine: `new → contacted → confirmed → in_production → delivered` (+ `cancelled`).
- Database: nomi di tabelle e colonne SEMPRE in inglese, snake_case (`sort_order`, non `ordine`). Schema e indici normativi: `docs/adr/schema-er.md`.
- Commit piccoli e descrittivi, in inglese. Una card = uno o pochi commit.
- Database remoto: VIETATO `supabase db reset --linked` (o qualsiasi comando distruttivo
  sul DB collegato) da quando esistono ordini reali. Le modifiche schema passano SOLO
  da nuove migrations additive (`db push`).

## Definition of Done (ogni task)

- `npm ci` (NON `npm install`) passa pulito in locale prima della PR: usa lo stesso
  install rigoroso della CI e becca il drift del lockfile prima che diventi rosso in CI.
- `npm run lint`, `npm run build` e `npm test` passano
- **e2e fuori dal gate (li lancia Daniele, mai il dev)**: per ogni PR basta
  lint+build+unit verdi. `make run-e2e-core` (flussi di dominio: carrello, ordine, login,
  admin ordini) lo lancia Daniele prima del merge; la suite intera (`make run-e2e`) deve
  essere verde **prima di aggiornare il branch `preview`** e al go-live. Un e2e non verifica
  mai un AC: protegge un journey (`.varco/docs/release/ACCEPTANCE.md`); i rossi noti si
  dichiarano in card, mai `skip` silenziosi nel codice (lezione F07).
- Nessuna chiave i18n mancante in uno dei due dizionari
- Responsive verificato (375px / 768px / 1280px) per task con UI
- A merge avvenuto: **`.varco/STATO.md` e board aggiornati dal TL/PM** (il dev segnala
  il merge con "PR #N mergiata", l'aggiornamento è compito del PM)

## Versione Node (fonte unica)

`.nvmrc` → `24` (LTS) è l'UNICA fonte di verità per la versione Node: `engines.node` in
`package.json` la rispecchia e la CI la legge con `node-version-file: .nvmrc`. Prima di
`npm install` assicurarsi di essere sulla versione del `.nvmrc` (`nvm use`), altrimenti
il lockfile si disallinea (lezione PR #3: lock generato su Node 26 ≠ CI su 22 → `npm ci`
rotto). Per cambiare major Node si aggiorna `.nvmrc` + `engines` e si rigenera il lock
nello stesso commit.
