# 0013 — Deploy: email (Resend) e anti-bot (Turnstile) fail-closed in produzione

Status: Accepted (2026-06-08) · **Reminder operativo per il go-live (Fase 6)**

## Contesto

F05 (invio ordine) integra **Turnstile** (anti-bot) e **Resend** (email di conferma al
cliente + notifica all'admin). Per restare testabile in dev/CI senza chiavi reali, il
codice degrada con grazia:

- `verifyTurnstile` (`src/lib/orders/turnstile.ts`): se manca `TURNSTILE_SECRET_KEY`
  usa la **test-key Cloudflare "always-pass"** → la verifica passa sempre.
- `defaultTransport` (`src/lib/orders/email.ts`): se manca `RESEND_API_KEY` usa un
  transport **console no-op** → non invia nulla.

Rischio in **produzione**: se per dimenticanza le chiavi non sono configurate, il sistema
degrada **in silenzio** — anti-bot spento (spam ordini) ed email non inviate (il cliente
non riceve conferma, l'admin non riceve la notifica) senza alcun errore visibile. Lo si
scoprirebbe dal cliente, non dai log.

Inoltre Resend richiede un **sender verificato** (verifica dominio via DNS) con tempi
tecnici: va avviata in anticipo, non il giorno del go-live.

## Decisione

1. **Fail-closed in produzione** (`NODE_ENV=production`):
   - Turnstile: se manca `TURNSTILE_SECRET_KEY` → errore esplicito (il verify rifiuta /
     l'app non parte). MAI la test-key always-pass in produzione.
   - Email: se manca `RESEND_API_KEY` → errore esplicito. MAI il no-op silenzioso.
   - I fallback "comodi" valgono **solo fuori produzione** (dev/CI).
2. **Variabili d'ambiente richieste a deploy** (documentate in `.env.example`):
   - `TURNSTILE_SECRET_KEY` + chiave sito pubblica del widget.
   - `RESEND_API_KEY`, `ORDER_EMAIL_FROM` (sender **verificato**), `ORDER_NOTIFY_EMAIL`
     (destinatario della notifica admin).
3. **Verifica dominio Resend avviata in anticipo** rispetto al go-live (lead time DNS).
4. La **checklist go-live (Fase 6)** verifica che, in build di produzione, l'assenza di una
   di queste chiavi fallisca rumorosamente.

## Conseguenze

- (+) Niente degradazioni silenziose in produzione: anti-bot sempre attivo, email garantite
  o errore visibile.
- (+) Reminder esplicito dei prerequisiti email/anti-bot — non si scopre il problema dal cliente.
- (−) Va aggiunto un guard d'ambiente prima del go-live; un deploy mal configurato fallisce
  (è il comportamento voluto).

## Implementazione

Il guard fail-closed si aggiunge in `verifyTurnstile` / `defaultTransport` (o come check
d'avvio) **quando si prepara il go-live (Fase 6)** — non ora, perché romperebbe la
testabilità degli ambienti di sviluppo. Riferimenti: `src/lib/orders/turnstile.ts`,
`src/lib/orders/email.ts`, `.env.example`.
