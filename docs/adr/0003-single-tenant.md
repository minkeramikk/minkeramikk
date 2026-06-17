# ADR 0003 — Single-tenant, schema predisposto al multi-tenant

**Stato**: Accepted · 2026-06-04

## Contesto

Il committente è un singolo artigiano. Il multi-tenant (vendere il configuratore ad altri
ceramisti) è plausibile ma fuori scope e fuori preventivo.

## Decisione

- Nessuna tabella `tenants`, nessun `tenant_id`, un solo utente admin.
- Si evita però ciò che precluderebbe il multi-tenant: **chiavi UUID**, niente singleton
  globali, configurazione (nome negozio, email ordini) in un **modulo unico**.

## Conseguenze

- (+) Meno tabelle e join; un eventuale multi-tenant è una migration additiva (`tenant_id`),
  non un rifacimento.
- (−) Se arrivasse, RLS e auth vanno comunque ripensate.
