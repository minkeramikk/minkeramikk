# ADR 0003 — Single-tenant, schema predisposto al multi-tenant

**Stato**: Accepted · 2026-06-04

## Contesto

Il committente è un singolo artigiano. Un'evoluzione plausibile è vendere il configuratore
ad altri ceramisti (multi-tenant), ma oggi non è in scope né in preventivo.

## Decisione

- Nessuna tabella `suppliers`/`tenants`, nessun tenant_id, un solo utente admin.
- Si evita però ciò che precluderebbe il multi-tenant: chiavi UUID, niente singleton
  globali nel codice, configurazione (nome negozio, email ordini) in un modulo unico
  e non sparsa.

## Conseguenze

- (+) Meno tabelle, meno join, back-office più semplice — coerente col budget fisso.
- (+) L'eventuale multi-tenant è una migration additiva (aggiunta colonna tenant_id),
  non un rifacimento.
- (−) Se il multi-tenant arrivasse, RLS e auth vanno ripensate comunque.
