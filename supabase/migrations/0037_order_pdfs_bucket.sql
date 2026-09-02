-- 0037 — R4-PDF-CLIENTE: bucket PRIVATO per i riepiloghi ordine.
--
-- ADDITIVA: un bucket nuovo, nessuna policy toccata su `assets`.
--
-- Perché non `assets`: quello è public=true (0003:9-11) con una policy
-- «assets public read» ad anon. Qui dentro ci sono nome, indirizzo e importi di
-- un cliente.
--
-- Perché NESSUNA policy: con RLS attiva, nessuna policy significa che nessun
-- ruolo ci arriva. Scrive e legge SOLO il service role, che RLS la bypassa, e lo
-- fa dietro l'autenticazione admin.
--
-- INVARIANTE (R4-PDF-CLIENTE, NOTA 2/9 sui riusi): nessuna superficie pubblica
-- risolve un PDF — non esiste route, pagina o parametro che, dato un ordine, ne
-- restituisca il riepilogo a un utente non autenticato. Una card futura che
-- volesse darlo al cliente dovrà riaprire QUELLA decisione, non aggiungere una
-- policy qui.
--
-- Nome dell'oggetto: summaries/{orders.id}.pdf — mai il codice ordine, che è
-- sequenziale (`'MK-' || nextval('order_seq')`, 0032:172) e renderebbe il path
-- indovinabile.
--
-- Sequenza PM: applicata su STAGING durante il lavoro; su PROD la applica il PM
-- a fine lavoro, poi `npm run db:types`.
insert into storage.buckets (id, name, public)
values ('order-pdfs', 'order-pdfs', false)
on conflict (id) do nothing;
