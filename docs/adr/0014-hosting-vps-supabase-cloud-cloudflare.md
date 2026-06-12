# ADR 0014 — Hosting: VPS (Next standalone) + Supabase Cloud + Cloudflare

**Stato**: Deferred · 2026-06-09 (deciso lo stesso giorno: si resta su **Vercel + piani gratuiti** per ora; VPS = fallback su intervento, rivalutazione dopo ~3 mesi di monitoraggio da settembre)

## Contesto

Il preventivo (fino a rev. 4) era stato venduto con **costi di esercizio 0 €/mese**,
assumendo che l'intero stack stesse nei piani gratuiti permanenti di Vercel, Supabase e
Resend.

L'assunzione è sbagliata su un punto: **il piano gratuito di Vercel (Hobby) non consente
l'uso commerciale**. minkeramikk.no è un'attività commerciale → il front-end non può stare
su Vercel free. Il piano gratuito di **Supabase**, invece, *ammette* l'uso commerciale: lì il
problema non c'è mai stato.

Va deciso ora perché impatta la messa in produzione (Fase 6) e il preventivo (rev. 5).

Forze in gioco: budget vicino allo zero per i costi ricorrenti; codice già scritto puntando a
Supabase Cloud (non a un Supabase self-hosted); traffico sporadico da bottega; ops che deve
gestire una sola persona.

## Decisione

Architettura risultante: **Supabase Cloud (free) ← Next.js standalone su VPS ~€5/mese
(Caddy) ← Cloudflare (free) davanti**. Email via Resend. ≈ €5/mese, conforme all'uso
commerciale, **codice invariato** (zero migrazione).

**1. Database/Auth/Storage: Supabase Cloud (free), non self-host.**
Far girare l'intero stack Supabase su un VPS da 4 GB è tirato e moltiplica le ops; meglio
lasciarlo gestito. Il free ammette l'uso commerciale e il codice già punta a Supabase Cloud →
nessuna migrazione DB. Due accorgimenti obbligatori, perché il free ha due limiti veri:
- **Pausa dopo 7 giorni di inattività.** Per un sito a traffico sporadico il DB si mette in
  pausa e il sito va giù finché non lo si riattiva a mano. Mitigazione: **keep-alive** — un cron
  esterno (es. cron-job.org) che ogni 2–3 giorni colpisce un endpoint applicativo che tocca il
  DB. Costo zero. *(Da implementare: endpoint + cron — vedi card INFRA.)*
- **Backup minimi sul free.** Mitigazione: **`pg_dump` schedulato** verso storage offsite
  (es. Cloudflare R2). *(Da implementare — card INFRA.)*

**2. Front-end: Next.js build `standalone` su VPS dedicato (~€5/mese).**
Il build standalone gira in ~150–250 MB; `sharp` e la generazione PDF (occasionale, solo
admin) ci stanno comodi su un box da €5. Risolve il problema ToS-commerciale di Vercel.
Reverse proxy: **`next start` dietro Caddy** (HTTPS automatico, poche parti in movimento).
Alternativa valutata: **Coolify** (DX alla Vercel — git push → deploy, HTTPS, dashboard) —
ottimo se in futuro ci girano più app o si vuole il cruscotto, ma aggiunge il suo stack
(Traefik + overhead + una cosa in più da mantenere). Per una sola app Next, Caddy è più
leggero → **default Caddy**, Coolify rivalutabile alla messa in produzione.

**3. Davanti: Cloudflare (free)** — DNS, CDN, cache, protezione anti-attacco. La cache davanti
aiuta anche a stare sotto il tetto egress di Supabase (immagini servite e cachate da CF).

**Alternative scartate:**
- *Vercel Hobby (free)* — vietato l'uso commerciale (causa del cambio).
- *Vercel Pro ($20/mese)* — conforme ma costo ricorrente 4× il VPS, senza vantaggi per questo
  traffico.
- *Supabase self-host su VPS 4 GB* — stack pesante, ops elevate, nessun guadagno reale.

## Conseguenze

- (+) Conforme all'uso commerciale; ≈ **€5/mese**; **codice invariato**, zero migrazione DB.
- (+) Percorso di upgrade chiaro e senza riscritture: a crescita, **Supabase Pro (~$25/mese)**
  toglie pausa e tetti; il VPS scala verticalmente.
- (−) I costi di esercizio non sono più 0 €: ~€5/mese (VPS). Domini già del cliente.
- (−) Ops minime ma presenti: keep-alive, `pg_dump`, aggiornamenti del VPS. La responsabilità
  della messa in produzione passa a noi → nel preventivo: **3 mesi di hosting gestito e
  monitorato inclusi**, poi passaggio al cliente o manutenzione a tariffa.
- (−) Tetti del free Supabase: **DB 500 MB**, **egress 5 GB/mese**, nessuna garanzia di
  SLA/no-pausa. Adeguati a questo traffico; da monitorare.
- (?) Scelta finale **Caddy vs Coolify** alla messa in produzione.
- (?) Verificare che 5 GB/mese di egress bastino con le immagini del configuratore (mitigato
  dalla cache Cloudflare davanti a Supabase Storage).
- (?) Implementare endpoint keep-alive e job `pg_dump` (card INFRA).

## Relazioni

- **Aggiorna** ADR 0013 (deploy / email / anti-bot fail-closed) per la parte di deploy: il
  target non è più Vercel ma VPS + Caddy.
- **Impatta** la card **INFRA** (go-live hardening): keep-alive, `pg_dump`, setup Caddy/VPS,
  Cloudflare.
- **Si riflette** nel **Preventivo rev. 5**: architettura aggiornata, costi di esercizio ~€5/mese
  (non più 0 €), voce "messa in produzione + 3 mesi hosting gestito".
