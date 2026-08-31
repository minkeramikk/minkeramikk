-- 0034 — R4-SCONTI ②: automations & upsell (ADR 0023, extends ADR 0022).
-- ADDITIVE: two new tables and one RPC. Nothing existing is altered; with
-- these tables empty the cart behaves exactly as it does after 0032/0033
-- alone.
--
-- PM sequence (two databases, Makefile:60-77): 0033 is applied on NEITHER
-- database yet (0032 alone is, on staging). Push 0033 THEN this file, in
-- that order: make db-push-staging, make db-status, make db-push-prod
-- before the merge, then npm run db:types (same order as 0032/0033's own
-- headers).

create table if not exists discount_rules (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  enabled              boolean not null default true,
  -- Trigger: the cart holds at least trigger_min_qty pieces from the rule's
  -- product group (discount_rule_products below). 1 = plain presence.
  trigger_min_qty      int  not null default 1 check (trigger_min_qty >= 1),
  suggested_product_id uuid not null references products (id) on delete cascade,
  suggested_qty        int  not null default 1 check (suggested_qty >= 1),
  -- fixed     = the shop's own deal %, independent of the tiers and alive
  --             even when the tiers are switched off (ADR 0023).
  -- inherited = the tier the trigger group currently earns.
  -- none      = suggest, do not discount.
  discount_mode        text not null default 'fixed'
                         check (discount_mode in ('fixed', 'inherited', 'none')),
  discount_pct         int  check (discount_pct > 0 and discount_pct <= 90),
  sort_order           int  not null default 0
);

-- The trigger GROUP: an admin multi-select of products, never a series (the
-- series dependency was explicitly cut by the client on 28/8 — ADR 0023).
create table if not exists discount_rule_products (
  rule_id    uuid not null references discount_rules (id) on delete cascade,
  product_id uuid not null references products (id)       on delete cascade,
  primary key (rule_id, product_id)
);

create index if not exists discount_rule_products_product_id
  on discount_rule_products (product_id);

-- ── atomic replace (delete + insert in one transaction, cf. 0021) ───────────
-- SECURITY INVOKER (default) → caller RLS applies; execute to authenticated.
--
-- Scoped by rule_id (a parent key) — same shape as 0021's
-- replace_design_products (`where design_id = p_design_id`). That parent-key
-- scoping is what keeps this delete clear of the pg_safeupdate SQLSTATE
-- 21000 that 0033 had to fix on 0032's two GLOBAL replace_* functions, which
-- had no parent key to scope by and so came out unqualified. The rule for
-- the next replace_* added to this project: scope the delete by a parent
-- key when one exists, or spell it `where true` like 0033 did when it
-- doesn't.
create or replace function replace_discount_rule_products(
  p_rule_id uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql
as $$
begin
  delete from discount_rule_products where rule_id = p_rule_id;
  insert into discount_rule_products (rule_id, product_id)
  select p_rule_id, pid from unnest(p_product_ids) as pid;
end;
$$;

revoke all on function replace_discount_rule_products(uuid, uuid[]) from public;
grant execute on function replace_discount_rule_products(uuid, uuid[]) to authenticated;

comment on function replace_discount_rule_products(uuid, uuid[]) is
  'ADR 0023: atomically replace a rule''s trigger product group (delete + insert in one transaction). Scoped by rule_id, so no pg_safeupdate 21000 (cf. 0033). Called via rpc() from the authenticated admin action.';

-- ── RLS: public read (the suggestion card renders client-side), authenticated writes ──
alter table discount_rules          enable row level security;
alter table discount_rule_products  enable row level security;

create policy "discount_rules public read" on discount_rules
  for select to anon using (true);
create policy "discount_rules authenticated all" on discount_rules
  for all to authenticated using (true) with check (true);

create policy "discount_rule_products public read" on discount_rule_products
  for select to anon using (true);
create policy "discount_rule_products authenticated all" on discount_rule_products
  for all to authenticated using (true) with check (true);
