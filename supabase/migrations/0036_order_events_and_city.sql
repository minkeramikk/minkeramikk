-- 0036 — R4-ORDERS-PLUS: activity log (order_events) + orders.city.
--
-- ADDITIVA. Con `order_events` vuota il back-office si comporta esattamente
-- come oggi: la riga «Order created» della timeline è SINTETICA, derivata da
-- `orders.created_at`, quindi copre gratis anche tutti gli ordini precedenti e
-- non serve nessun backfill.
--
-- Sequenza PM (Makefile:76-90): make db-push-staging → make db-status →
-- make db-push-prod prima del merge, poi `npm run db:types` per rigenerare
-- src/lib/supabase/types.ts (qui è patchato a mano, in modo additivo).

create table if not exists order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Testo e non enum: il catalogo dei kind è deciso in card e vive nel codice
  -- (src/lib/orders/order-events.ts). Un kind sconosciuto viene saltato dal
  -- renderer, così un deploy più nuovo non rompe una pagina più vecchia — cosa
  -- che un enum in DB renderebbe impossibile senza una migration per ogni voce.
  kind       text not null,
  meta       jsonb not null default '{}'::jsonb
);

-- La timeline si legge sempre per ordine e in ordine cronologico.
create index if not exists order_events_order_id_created_at
  on order_events (order_id, created_at);

-- ── RLS PROPRIA: il registro è back-office ─────────────────────────────────
-- Le server action admin girano col client a cookie (anon key, ruolo
-- `authenticated` — src/lib/supabase/server.ts), mai col service role: insert e
-- select vanno quindi ad `authenticated`. Ad `anon` NIENTE: nessuna policy, che
-- con RLS attiva significa nessun accesso. Nessun update e nessun delete per
-- nessuno — un registro che si può riscrivere non è un registro (le righe se ne
-- vanno solo col loro ordine, via `on delete cascade`).
alter table order_events enable row level security;

create policy "order_events authenticated select" on order_events
  for select to authenticated using (true);
create policy "order_events authenticated insert" on order_events
  for insert to authenticated with check (true);

comment on table order_events is
  'R4-ORDERS-PLUS: activity log per ordine. Scritto SOLO dalle server action admin, mai dal client. Nessun backfill: «Order created» è derivato da orders.created_at.';

-- ── voce C: poststed ───────────────────────────────────────────────────────
-- Lacuna della 0012: l'indirizzo raccoglieva address/zipcode/country ma non la
-- città. Su un'etichetta norvegese servono postnummer E poststed, e per il
-- mercato EUR la città è obbligatoria.
alter table orders add column if not exists city text;

comment on column orders.city is
  'Poststed. NULL sugli ordini precedenti: l''admin e il PDF lo mostrano solo se presente. R4-ORDERS-PLUS voce C.';

-- ── create_order(): da 9 a 10 argomenti ────────────────────────────────────
-- NON è una `create or replace`: un decimo parametro con default creerebbe un
-- OVERLOAD, e la chiamata a 9 argomenti nominati (PostgREST, src/lib/orders/
-- create.ts) diventerebbe ambigua. Serve drop + create + re-grant, esattamente
-- il passo che fece la 0012 andando da 6 a 9 argomenti (0012:13,77-78).
--
-- Il corpo è quello VIVO della 0032 (con le tre colonne sconto sulle righe),
-- non quello della 0012, più `city`.
drop function if exists create_order(text, text, text, text, text, jsonb, text, text, text);

create or replace function create_order(
  p_customer_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_locale text,
  p_items jsonb,
  p_address text default '',
  p_zipcode text default '',
  p_country text default '',
  p_city text default ''
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_order_id uuid;
  it jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order must have at least one item';
  end if;

  v_code := 'MK-' || nextval('order_seq');

  insert into orders (
    code, customer_name, email, phone, message, locale, status,
    address, zipcode, country, city
  )
  values (
    v_code, p_customer_name, p_email, p_phone, p_message, p_locale, 'new',
    nullif(p_address, ''), nullif(p_zipcode, ''), nullif(p_country, ''),
    nullif(p_city, '')
  )
  returning id into v_order_id;

  for it in select * from jsonb_array_elements(p_items)
  loop
    insert into order_items (
      order_id, supplier_id, supplier_name_snapshot,
      product_id, product_name_snapshot,
      price_cents_snapshot, currency_snapshot,
      config_code, config_snapshot, quantity,
      discount_pct, discount_cents, discount_source
    ) values (
      v_order_id,
      (it->>'supplier_id')::uuid,
      it->>'supplier_name_snapshot',
      nullif(it->>'product_id', '')::uuid,
      it->>'product_name_snapshot',
      (it->>'price_cents_snapshot')::int,
      it->>'currency_snapshot',
      it->>'config_code',
      it->'config_snapshot',
      (it->>'quantity')::int,
      nullif(it->>'discount_pct', '')::int,
      coalesce(nullif(it->>'discount_cents', '')::int, 0),
      nullif(it->>'discount_source', '')
    );
  end loop;

  return v_code;
end;
$$;

revoke all on function create_order(text, text, text, text, text, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function create_order(text, text, text, text, text, jsonb, text, text, text, text)
  to service_role;
