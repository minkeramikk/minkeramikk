-- 0021_design_products.sql — F34: optional design→product whitelist (ADR 0017).
-- No rows for a design  → all its supplier's visible products (current behaviour).
-- Rows present          → only those (intersected with visible, resolved app-side).
-- Extends ADR 0007: the supplier stays the hook; this only narrows inside it.

create table design_products (
  design_id  uuid not null references designs(id)  on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (design_id, product_id)
);

-- reverse lookup ("which designs pin this product") + fast cascade on product delete
create index design_products_product_id on design_products (product_id);

-- ── same-supplier invariant (defense in depth; app also validates) ──────────
-- A whitelist row only makes sense when design and product share a supplier.
create function design_products_same_supplier()
returns trigger
language plpgsql
as $$
declare
  d_supplier uuid;
  p_supplier uuid;
begin
  select supplier_id into d_supplier from designs  where id = new.design_id;
  select supplier_id into p_supplier from products where id = new.product_id;
  if d_supplier is distinct from p_supplier then
    raise exception
      'design_products: design % and product % belong to different suppliers',
      new.design_id, new.product_id;
  end if;
  return new;
end;
$$;

create trigger design_products_same_supplier_check
  before insert or update on design_products
  for each row execute function design_products_same_supplier();

-- ── atomic replace (delete + insert in one transaction) ─────────────────────
-- Mirrors replace_product_attributes (0017): no intermediate empty state.
-- SECURITY INVOKER (default) → caller RLS applies; execute to authenticated only.
create function replace_design_products(
  p_design_id   uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql
as $$
begin
  delete from design_products where design_id = p_design_id;
  insert into design_products (design_id, product_id)
  select p_design_id, pid from unnest(p_product_ids) as pid;
end;
$$;

revoke all on function replace_design_products(uuid, uuid[]) from public;
grant execute on function replace_design_products(uuid, uuid[]) to authenticated;

comment on function replace_design_products(uuid, uuid[]) is
  'F34: atomically replace a design''s product whitelist (delete + insert in one transaction). Called via rpc() from the authenticated admin action.';

-- ── RLS: public read (anon configurator needs it), authenticated writes ─────
alter table design_products enable row level security;

create policy "design_products public read"
  on design_products for select
  to anon
  using (true);

create policy "design_products authenticated all"
  on design_products for all
  to authenticated
  using (true)
  with check (true);
