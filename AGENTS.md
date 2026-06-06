<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# minkeramikk.no — Regole di progetto

Rifacimento di minkeramikk.no: configuratore di ceramica personalizzata + finto e-commerce
(ordine via email, nessun pagamento online) + back-office. Cliente singolo, NON multi-tenant.

## Documenti di riferimento (leggere prima di task nuovi)

- `docs/adr/` — **decisioni architetturali (ADR)**: vincolanti; una decisione nuova o un cambio di rotta = nuovo ADR (usare `docs/adr/template.md`, aggiornare l'indice)
- `../docs/stack-tecnologico.md` — architettura, stack, modello dati
- `../docs/theme/DESIGN-SYSTEM.md` — **design system**: token, componenti, shell, mapping shadcn; vincolante per ogni task UI (baseline visiva: `../docs/theme/template-*.html` + `preview-*.png`)
- `../docs/preview/*.html` — spec UI del back-office (mockup approvati dal cliente)
- `../docs/preventivo-minkeramikk.pdf` — scope contrattuale: ciò che non è in fornitura NON va implementato senza chiedere
- `TODO.md` — fondamenta (fasi 0–1bis): prendere il primo task non spuntato, spuntarlo a lavoro finito
- `docs/DELIVERY.md` — **board kanban a flussi** (dopo le fondamenta): ciclo AC → dev → test → PR (aperta solo a flusso finito, con evidenza) → review agent → merge. WIP=1.

## Stack (non deviare senza motivo scritto in TODO.md)

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
  Componenti, varianti e stati: come da `../docs/theme/DESIGN-SYSTEM.md` — un componente
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
- Commit piccoli e descrittivi, in inglese. Un task di TODO.md = uno o pochi commit.
- Database remoto: VIETATO `supabase db reset --linked` (o qualsiasi comando distruttivo
  sul DB collegato) da quando esistono ordini reali. Le modifiche schema passano SOLO
  da nuove migrations additive (`db push`).

## Definition of Done (ogni task)

- `npm ci` (NON `npm install`) passa pulito in locale prima della PR: usa lo stesso
  install rigoroso della CI e becca il drift del lockfile prima che diventi rosso in CI.
- `npm run lint`, `npm run build` e `npm test` passano
- Nessuna chiave i18n mancante in uno dei due dizionari
- Responsive verificato (375px / 768px / 1280px) per task con UI
- TODO.md aggiornato (task spuntato, eventuali task nuovi scoperti aggiunti)

## Versione Node (fonte unica)

`.nvmrc` → `24` (LTS) è l'UNICA fonte di verità per la versione Node: `engines.node` in
`package.json` la rispecchia e la CI la legge con `node-version-file: .nvmrc`. Prima di
`npm install` assicurarsi di essere sulla versione del `.nvmrc` (`nvm use`), altrimenti
il lockfile si disallinea (lezione PR #3: lock generato su Node 26 ≠ CI su 22 → `npm ci`
rotto). Per cambiare major Node si aggiorna `.nvmrc` + `engines` e si rigenera il lock
nello stesso commit.
