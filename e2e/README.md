# e2e — suite snella (riscritta 2026-06-17)

Otto **journey** critici, 1:1 con [`docs/release/ACCEPTANCE.md`](../../docs/release/ACCEPTANCE.md).
La suite verifica gli AC di quel documento — quello è la fonte di verità, non i test.

| Spec | Journey | Note |
|---|---|---|
| `configurator.spec.ts` | design → opzioni → ceramica | core |
| `config-code.spec.ts` | codice configurazione | core |
| `cart.spec.ts` | carrello + drawer | core |
| `order.spec.ts` | invio ordine | core · **nessun invio reale** |
| `admin-auth.spec.ts` | login/guard admin | core |
| `admin-orders.spec.ts` | gestione ordini | core · seed via service role |
| `supplier-pdf.spec.ts` | PDF fornitore | full · desktop-only |
| `share-set.spec.ts` | share your set (CA-3) | full · desktop-only |
| `order-email.spec.ts` | invio email ordine reale | **opt-in**, `make test-email` |
| `supplier-email.spec.ts` | PDF fornitore + inoltro reale | **opt-in**, `make test-email` · fornitore usa-e-getta |
| `evidence.spec.ts` | screenshot per il cliente | tooling, non gate |

## Comandi

```
make run-e2e-core   # per-PR: i 6 journey core (desktop + mobile)
make run-e2e        # full: core + supplier-pdf + share-set
make test-email     # opt-in: UN ordine con email reali alla casella dedicata
make run-e2e-grep G=cart   # una spec singola
```

## Principi (perché la vecchia suite si rompeva)

1. **Scoprire le entità a runtime, mai hardcodare.** Niente slug prodotto né
   conteggi fissi: il catalogo è un DB vivo e condiviso. Si usano gli helper
   `firstActiveDesign`, `addFirstCeramic`, `ceramicCards`, e si legge dal DB
   (service role) ciò che serve. La vecchia suite asseriva "8 prodotti" e
   `product-vietri-flat`: si è rotta quando il catalogo è cambiato.
2. **Selettori stabili = contratto.** Gli e2e dipendono solo dai `data-testid`
   elencati in ACCEPTANCE.md. Cambiare un testid del contratto → aggiornare lì.
3. **Asserzioni resilienti.** Si verifica che entità note esistano e che le
   relazioni reggano, non valori esatti soggetti a drift.
4. **Nessuna mutazione permanente del DB condiviso.** Si seedano solo dati di
   test effimeri (ordini, design inattivi) **con cleanup** in `afterAll`.

## Email & Turnstile nei test

- **Email**: la suite core/full gira con `RESEND_API_KEY` vuota → transport
  no-op → **zero invii**. L'ordine viene comunque creato e la conferma testata.
  Solo `make test-email` invia davvero verso `E2E_EMAIL_TO` (default
  `dangeli88.daniele@gmail.com`): **(a)** la conferma ordine (cliente +
  notifica admin) e **(b)** il PDF d'ordine al fornitore — quest'ultimo seedando
  un fornitore usa-e-getta con quell'email, così non parte nulla verso un
  laboratorio reale.
- **Vincolo Resend**: col sender di test `onboarding@resend.dev` la consegna è
  ammessa **solo verso l'email dell'account** (un alias `+` viene rifiutato).
  Per inviare a indirizzi arbitrari serve verificare il dominio `minkeramikk.no`
  in Resend e impostare un `ORDER_EMAIL_FROM` su quel dominio.
- **Turnstile**: `make build` builda con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` VUOTA
  → il widget emette il token always-pass e il server (senza
  `TURNSTILE_SECRET_KEY`) usa il secret always-pass. Una site key invalida (es.
  `dd`) romperebbe l'invio: è la causa storica del rosso su `order`.

## Prerequisiti & skip

- `.env.local` con Supabase live. Senza → niente catalogo, i test falliscono.
- I journey admin (`admin-orders`, parte di `supplier-pdf`) si **auto-skippano**
  senza `ADMIN_EMAIL`/`ADMIN_PASSWORD` + service role.
- Vincolo Resend per `test-email`: col sender di test (`onboarding@resend.dev`)
  la consegna è ammessa SOLO verso l'email dell'account (`dangeli88.daniele@gmail.com`)
  — gli alias `+qualcosa` vengono rifiutati con 403 (verificato 2026-09-02). Per
  spedire ad altri indirizzi serve il dominio `minkeramikk.no` verificato.
