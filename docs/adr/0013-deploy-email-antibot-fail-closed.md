# ADR 0013 — Deploy: email (Resend) e anti-bot (Turnstile) fail-closed in produzione

**Stato**: Accepted · 2026-06-08 · Reminder operativo per il go-live · deploy aggiornato da ADR 0014

## Contesto

F05 integra **Turnstile** (anti-bot) e **Resend** (email conferma cliente + notifica admin).
Per restare testabili senza chiavi, in dev/CI il codice degrada: `verifyTurnstile` usa la
test-key Cloudflare "always-pass" se manca `TURNSTILE_SECRET_KEY`; `defaultTransport` usa un
no-op console se manca `RESEND_API_KEY`. In **produzione** questo degraderebbe **in silenzio**
(spam ordini, email non inviate, scoperto dal cliente non dai log). Resend richiede inoltre un
**sender verificato** via DNS, con lead time.

## Decisione

1. **Fail-closed in produzione** (`NODE_ENV=production`): chiave Turnstile o Resend mancante →
   **errore esplicito**, mai i fallback "comodi" (validi solo in dev/CI).
2. **Env richieste a deploy** (in `.env.example`): `TURNSTILE_SECRET_KEY` + chiave sito;
   `RESEND_API_KEY`, `ORDER_EMAIL_FROM` (sender verificato), `ORDER_NOTIFY_EMAIL`.
3. **Verifica dominio Resend avviata in anticipo** (lead time DNS).
4. La **checklist go-live** verifica che, in build di produzione, l'assenza di una chiave fallisca rumorosamente.

## Conseguenze

- (+) Niente degradazioni silenziose: anti-bot attivo, email garantite o errore visibile.
- (−) Un guard d'ambiente da aggiungere al go-live; un deploy mal configurato fallisce (voluto).

## Implementazione

Il guard si aggiunge in `verifyTurnstile` / `defaultTransport` (o come check d'avvio) **al
go-live**, non prima (romperebbe la testabilità). Rif.: `src/lib/orders/turnstile.ts`,
`src/lib/orders/email.ts`, `.env.example`.
