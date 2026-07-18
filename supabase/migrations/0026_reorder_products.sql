-- F39 §3-bis — atomic per-supplier product reorder.
-- ADDITIVE: creates one function, touches no table, no data. Old code ignores it.
--
-- Mirrors replace_product_attributes (0017) / replace_supplier_colors (0022):
-- one statement, one transaction, no intermediate corrupt state. Replaces the
-- old moveProduct loop, which issued one awaited UPDATE per row and could leave
-- the list half-renumbered on failure.
--
-- sort_order becomes 1..n WITHIN the supplier group (the public configurator
-- already filters products by supplier_id, so per-group numbering is enough).
-- SECURITY INVOKER (default) → caller RLS applies; execute to authenticated only.
create or replace function reorder_products(
  p_supplier_id uuid,
  p_ids         uuid[]
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- AC-D3 server side: refuse an id that is not in this supplier's group, so a
  -- confused client can never drag a product across suppliers.
  if exists (
    select 1 from unnest(p_ids) as pid
    where not exists (
      select 1 from products p where p.id = pid and p.supplier_id = p_supplier_id
    )
  ) then
    raise exception 'reorder_products: id not in supplier % group', p_supplier_id;
  end if;

  -- p_ids is expected to be a permutation of the group: the caller sends the
  -- whole list it just reordered. A duplicated id would make which `ord` wins
  -- nondeterministic; the drag list cannot produce one, so it is not guarded.
  update products p
     set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where p.id = o.id
     and p.supplier_id = p_supplier_id;
end;
$$;

revoke all on function reorder_products(uuid, uuid[]) from public;
grant execute on function reorder_products(uuid, uuid[]) to authenticated;
