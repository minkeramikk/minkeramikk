# F05 — Invio ordine (order submission)

**Branch:** `flow/f05-order-submit` → `main` · **dep:** F03 ✅ F04 ✅
**Non-merge:** review agent prima del merge.

## Cosa fa

Form ordine sullo step 3 (nome, email, telefono, messaggio) + Turnstile → `POST /api/orders`
→ ordine atomico in Postgres con codice progressivo `MK-NNNN` → email cliente (sua lingua) +
notifica admin → pagina di conferma; carrello svuotato al successo, preservato all'errore.

## Acceptance criteria

- **AC1** — Validazione client+server dallo **stesso** schema zod (`src/lib/orders/schema.ts`).
  Form con `noValidate` → zod è l'unico validatore; campo invalido marcato `aria-invalid`,
  nessun ordine, carrello intatto. Turnstile token inviato col payload. *(e2e desktop+mobile)*
- **AC2** — `POST /api/orders` valida payload + righe; in transazione (`create_order`,
  SECURITY DEFINER) crea `orders` (status `new`, `locale`, `code` da sequence) + un
  `order_items` per riga con snapshot COMPLETI: `supplier_id` NOT NULL + `supplier_name_snapshot`,
  `product_id` + `product_name_snapshot`, `price_cents_snapshot` + `currency_snapshot`,
  `config_code` canonico (ADR 0011), `config_snapshot` jsonb, `quantity`. Prezzi sempre
  cents+currency, mai float (Money VO, ADR 0005). *(unit + integration)*
- **AC3** — Codice `MK-NNNN` progressivo, unico, **concorrenza-safe** via `order_seq`
  (`nextval`). Due submit ravvicinati → due codici distinti, 0 duplicati. *(integration test)*
- **AC4** — Turnstile verificato server-side col secret; token mancante/invalido → 400,
  nessun ordine. In dev/CI: test-key Cloudflare always-pass + auto-token. *(unit + integration)*
- **AC5** — Resend: conferma cliente nella sua lingua + notifica admin. Transport
  iniettabile, **mock in test** (nessun invio reale in CI); fallimento email non fa fallire
  l'ordine (loggato). *(integration: 2 email mockate)*
- **AC6** — Successo → carrello svuotato (localStorage) + redirect a `/order?code=...`;
  errore → carrello preservato, messaggio cortese, nessun ordine parziale. *(e2e)*
- **AC7** — RLS insert-only: anon **INSERT** su orders ok ma **SELECT/UPDATE** negati
  (insert-only pubblico, migration 0002). *(rls.test.ts: insert ok + riga invisibile in select)*
- **AC8** — i18n NO/EN su form, conferma ed email; mobile 390px senza overflow. *(e2e en + mobile)*

## Decisioni

- **`create_order` SECURITY DEFINER atomico** — un solo round-trip, multi-tabella, codice
  dalla sequence; `revoke from public/anon/authenticated`, `grant execute to service_role`.
- **Service-role client server-only** (`src/lib/supabase/service.ts`, senza `next/headers`)
  così i moduli ordine non trascinano cookie request-scoped (testabili in vitest).
- **`noValidate`** sul form: zod unico validatore client+server (no HTML5 native che
  bloccava il submit prima del handler).
- **Carrello come prop** da `CeramicsStep` (single source) + `clear()` su successo — evita
  il doppio stato `useCart` (gli storage event non scattano same-document).
- **Turnstile dev/CI**: senza site key reale emette subito `test-token` e salta la challenge
  (irrisolvibile headless); il server usa il secret test always-pass. Prod = widget reale.
- **Email transport no-op** di default (console) se manca `RESEND_API_KEY`; Resend reale
  solo con key. Nessun invio reale in CI.

## DoD (Node 24 / `npm ci` pulito)

- `eslint` — pulito (exit 0)
- `vitest run` — **77 passed (9 file)**, incl. unit schema/builder/sequence + integration
  (codice+snapshot+2 email, concorrenza, Turnstile-fail→400) + `rls.test.ts` insert-only
- `next build` — OK, **31 route** generate
- Playwright — **33 desktop** + **F05 mobile 4/4** verdi; regressione F01–F04/F13/F14 intatta
- Parità i18n NO/EN (solo chiave meta `_review` extra in EN, non user-facing)

## STOP-condition (entrambe soddisfatte)

- Sequence concorrenza-safe ✅ (`order_seq` + `nextval`, verificato con submit concorrenti)
- RLS insert-only presente ✅ (migration 0002; provata in `rls.test.ts`)

## Migration

`supabase/migrations/0007_order_seq.sql` — **additiva** (no reset): `create sequence if not
exists order_seq start 1001` + `create or replace function create_order(...)`. Types rigenerati.

## Evidenza

`docs/evidence/f05/` — `f05-form-390.png`, `f05-form-1280.png`, `f05-confirmation.png`.

## File principali

- dati: `supabase/migrations/0007_order_seq.sql`
- logica: `src/lib/orders/{schema,build,turnstile,email,create}.ts`, `src/lib/supabase/service.ts`
- API: `src/app/api/orders/route.ts`
- UI: `src/app/[locale]/(public)/configurator/order-form.tsx`, `ceramics-step.tsx`,
  `src/components/ui-domain/turnstile.tsx`, `src/app/[locale]/(public)/order/page.tsx`
- test: `src/lib/orders/orders.test.ts`, `create.integration.test.ts`,
  `src/lib/supabase/rls.test.ts`, `e2e/f05.spec.ts`, `e2e/evidence.spec.ts`
- i18n: `src/i18n/messages/{no,en}.json` (namespace `order`)

## Push / apertura PR (manuale — push bloccato in sandbox)

```bash
git push -u origin flow/f05-order-submit
gh pr create --base main --head flow/f05-order-submit \
  --title "F05 — Invio ordine (order submission)" --body-file PR-F05-body.md
```
