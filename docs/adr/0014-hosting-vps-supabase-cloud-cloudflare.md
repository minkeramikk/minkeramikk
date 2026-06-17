# ADR 0014 — Hosting: VPS (Next standalone) + Supabase Cloud + Cloudflare

**Stato**: Deferred · 2026-06-09 — si resta su **Vercel + piani gratuiti** per ora; il VPS è il
fallback su intervento, rivalutazione dopo ~3 mesi di monitoraggio (da settembre).

## Contesto

Il preventivo (fino a rev. 4) prometteva costi di esercizio 0 €/mese assumendo tutto nei piani
gratuiti. Un punto è sbagliato: il free di **Vercel (Hobby) non consente l'uso commerciale**, e
minkeramikk.no è commerciale. Il free di **Supabase** invece ammette l'uso commerciale. Forze:
budget ~zero ricorrente, codice già su Supabase Cloud (non self-host), traffico sporadico, ops a una persona.

## Decisione (architettura target, differita)

**Supabase Cloud (free) ← Next.js standalone su VPS ~€5/mese (Caddy) ← Cloudflare (free)**.
Email via Resend. ≈ €5/mese, conforme al commerciale, **codice invariato** (zero migrazione DB).

- **DB/Auth/Storage**: Supabase Cloud free, non self-host. Due limiti da mitigare: pausa dopo 7gg
  inattività → **keep-alive** (cron esterno ogni 2–3gg su endpoint che tocca il DB); backup minimi
  → **`pg_dump` schedulato** su storage offsite (es. R2). *(card INFRA)*
- **Front-end**: build `standalone` (~150–250 MB, sharp/PDF ok su box €5) dietro **Caddy**
  (HTTPS automatico). Coolify valutato ma più pesante → default Caddy, rivedibile al go-live.
- **Davanti**: Cloudflare free (DNS, CDN, cache; aiuta sotto il tetto egress Supabase).

**Scartate**: Vercel Hobby (no commerciale), Vercel Pro ($20/mese, 4× il VPS), Supabase self-host (ops alte).

## Conseguenze

- (+) Conforme; ≈ €5/mese; codice invariato; upgrade path chiaro (Supabase Pro ~$25/mese a crescita).
- (−) Esercizio non più 0 €; ops minime (keep-alive, `pg_dump`, update VPS); preventivo rev. 5
  con "3 mesi hosting gestito".
- (−) Tetti free Supabase: DB 500 MB, egress 5 GB/mese, no SLA — da monitorare.
- (?) Caddy vs Coolify al go-live; verifica egress 5 GB/mese con le immagini; implementare keep-alive + `pg_dump`.

## Relazioni

- **Aggiorna** ADR 0013 per il target di deploy (VPS + Caddy, non Vercel).
- **Impatta** la card **INFRA** (keep-alive, `pg_dump`, Caddy/VPS, Cloudflare) e il **Preventivo rev. 5**.
