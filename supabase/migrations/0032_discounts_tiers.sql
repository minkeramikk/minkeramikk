-- 0032 — R4-SCONTI ①: quantity discounts per product (ADR 0022).
--
-- ADDITIVE throughout: two new tables, three new columns on order_items, one on
-- orders, two on settings, and a create_order() replacement that keeps its
-- 9-argument signature (so no grant and no caller changes, cf. 0012).
-- Nothing is backfilled: a legacy order_items row has discount_pct NULL and
-- discount_cents 0, which renders exactly as it does today.
--
-- PM sequence (corrected — two databases, Makefile:60-77): make db-push-staging
-- FIRST (unblocks integration tests + e2e seeders of Tasks 7/9/14/15), then
-- make db-status, then make db-push-prod before the merge, then npm run db:types.

-- ── the scale ───────────────────────────────────────────────────────────────
-- One global scale (spec-sconti.html §1: "una scala unica"). Rows, not a jsonb
-- blob, so the admin form is a plain list and a bad row can never corrupt the
-- others. pct is an integer percentage: 5 = 5%.
create table if not exists discount_tiers (
  id         uuid primary key default gen_random_uuid(),
  min_qty    int  not null check (min_qty >= 2),
  pct        int  not null check (pct > 0 and pct <= 90),
  sort_order int  not null default 0
);

-- Alessio's confirmed starting scale (27/8). Seeded once; editable in admin.
insert into discount_tiers (min_qty, pct, sort_order)
select * from (values (4, 5, 0), (6, 8, 1), (8, 10, 2), (12, 15, 3)) as v(a, b, c)
where not exists (select 1 from discount_tiers);

-- ── inclusion multi-select ──────────────────────────────────────────────────
-- Presence = included. NO ROWS = EVERY product is included (same convention as
-- design_products / ADR 0017), so this ships with no backfill and the admin
-- "all" state costs zero rows.
create table if not exists discount_products (
  product_id uuid primary key references products (id) on delete cascade
);

-- ── the snapshot on the order lines ─────────────────────────────────────────
-- The discount ACTUALLY GRANTED that day, frozen next to price_cents_snapshot.
-- A historic order must show its own discount forever, never the current tiers.
alter table order_items
  add column if not exists discount_pct    int,
  add column if not exists discount_cents  int not null default 0,
  add column if not exists discount_source text;

comment on column order_items.discount_pct is
  'Percentage applied to this line at send time (NULL = none). ADR 0022.';
comment on column order_items.discount_cents is
  'Amount taken off this line, minor units. Frozen: never recomputed. ADR 0022.';
comment on column order_items.discount_source is
  'tier | deal | NULL — which mechanic granted it. ADR 0022.';

-- ── ratification ────────────────────────────────────────────────────────────
-- Twin of orders.paid_at (ADR 0021): NULL = the discount is still only
-- indicative, timestamp = the shop stands behind it. One fact, no enum.
alter table orders
  add column if not exists discount_ratified_at timestamptz;

comment on column orders.discount_ratified_at is
  'Discount ratified by the shop (NULL = indicative). ADR 0022.';

-- ── master switches ─────────────────────────────────────────────────────────
-- Default FALSE: the card ships dark and Alessio turns each half on when he is
-- ready. automations_enabled is claimed here so 0033 only adds tables.
alter table settings
  add column if not exists quantity_discounts_enabled boolean not null default false,
  add column if not exists automations_enabled        boolean not null default false;

-- ── atomic replaces (delete + insert in one transaction, cf. 0021) ──────────
-- SECURITY INVOKER (default) → caller RLS applies; execute to authenticated.
create or replace function replace_discount_tiers(p_rows jsonb)
returns void
language plpgsql
as $$
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'replace_discount_tiers: p_rows must be a json array';
  end if;
  delete from discount_tiers;
  insert into discount_tiers (min_qty, pct, sort_order)
  select (r->>'min_qty')::int, (r->>'pct')::int, (r->>'sort_order')::int
  from jsonb_array_elements(p_rows) as r;
end;
$$;

revoke all on function replace_discount_tiers(jsonb) from public;
grant execute on function replace_discount_tiers(jsonb) to authenticated;

create or replace function replace_discount_products(p_product_ids uuid[])
returns void
language plpgsql
as $$
begin
  delete from discount_products;
  insert into discount_products (product_id)
  select pid from unnest(p_product_ids) as pid;
end;
$$;

revoke all on function replace_discount_products(uuid[]) from public;
grant execute on function replace_discount_products(uuid[]) to authenticated;

-- ── RLS: public read (the cart computes client-side), authenticated writes ──
-- Nothing here is secret: every row is shown to the customer in the cart.
alter table discount_tiers   enable row level security;
alter table discount_products enable row level security;

create policy "discount_tiers public read" on discount_tiers
  for select to anon using (true);
create policy "discount_tiers authenticated all" on discount_tiers
  for all to authenticated using (true) with check (true);

create policy "discount_products public read" on discount_products
  for select to anon using (true);
create policy "discount_products authenticated all" on discount_products
  for all to authenticated using (true) with check (true);

-- ── create_order(): persist the three new item columns ──────────────────────
-- SAME 9-argument signature as 0012 → no drop, no re-grant, no caller change.
-- The values come from the SERVER's own recomputation (src/lib/orders/create.ts),
-- never from the browser.
create or replace function create_order(
  p_customer_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_locale text,
  p_items jsonb,
  p_address text default '',
  p_zipcode text default '',
  p_country text default ''
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
    address, zipcode, country
  )
  values (
    v_code, p_customer_name, p_email, p_phone, p_message, p_locale, 'new',
    nullif(p_address, ''), nullif(p_zipcode, ''), nullif(p_country, '')
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
