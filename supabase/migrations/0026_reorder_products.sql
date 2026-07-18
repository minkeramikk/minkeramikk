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

  -- p_ids must be a full permutation of the group, not a subset: the UPDATE
  -- below only touches the ids it is given, so a partial list would renumber
  -- part of the group 1..k and leave the rest on their old values — duplicate
  -- and gapped sort_order, silently, with no error for the admin to see.
  -- Three conditions together prove p_ids is a permutation of the group:
  -- every id belongs to the supplier (guard above), the DISTINCT count equals
  -- the group size, AND the array length equals it too. The length check is not
  -- redundant: [a1, a2, a1] on a 2-product group has distinct count 2 and only
  -- known ids, yet `unnest ... with ordinality` would match a1 twice and which
  -- `ord` wins is unspecified. With all three, |p_ids| = |distinct p_ids| =
  -- |group| ⇒ bijection.
  -- A stale client — e.g. a page rendered before a clone added a product —
  -- lands here and gets a clean failure the UI can roll back on (AC-D4).
  -- ERRCODE 22023 (invalid_parameter_value) so the action can discriminate this
  -- failure by SQLSTATE instead of matching the message text.
  if (select count(distinct pid) from unnest(p_ids) as pid)
       <> (select count(*) from products p where p.supplier_id = p_supplier_id)
     or coalesce(array_length(p_ids, 1), 0)
       <> (select count(*) from products p where p.supplier_id = p_supplier_id)
  then
    raise exception 'reorder_products: p_ids must list every product of supplier % exactly once', p_supplier_id
      using errcode = '22023';
  end if;

  update products p
     set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where p.id = o.id
     and p.supplier_id = p_supplier_id;
end;
$$;

revoke all on function reorder_products(uuid, uuid[]) from public;
grant execute on function reorder_products(uuid, uuid[]) to authenticated;
