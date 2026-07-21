-- R-EXTRA — atomic design reorder, twin of reorder_products (0026).
-- ADDITIVE: creates one function, touches no table, no data. Old code ignores it.
--
-- No supplier grouping here: /admin/designs is ONE flat list and step 1 of the
-- configurator renders every active design in a single grid, so sort_order is
-- global (1..n over the whole table) and the "id not in group" guard of 0026
-- has no counterpart.
--
-- The permutation guard is kept verbatim in spirit: p_ids must list every design
-- exactly once. The UPDATE only touches the ids it is given, so a subset would
-- renumber part of the catalog 1..k and leave the rest on their old values —
-- duplicate and gapped sort_order, silently. Three counts prove the bijection:
--   len(p_ids) = distinct(p_ids)  → no duplicate ([a, b, a] on a 2-row table
--                                   passes a bare distinct check yet would match
--                                   `a` twice, winning ordinality unspecified)
--   distinct(p_ids) = matched     → every id is a real design (an unknown uuid
--                                   would silently eat one position and leave a
--                                   real design on its old sort_order — this is
--                                   what 0026's supplier-membership guard did)
--   matched = count(designs)      → the list covers the whole catalog
-- ERRCODE 22023 (invalid_parameter_value) so the action can discriminate a stale
-- client by SQLSTATE instead of matching the message text.
--
-- SECURITY INVOKER (default) → caller RLS applies; execute to authenticated only,
-- with the explicit anon revoke that 0027 taught us is NOT implied by revoking
-- from public on this project.
create or replace function reorder_designs(p_ids uuid[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n_ids      int := coalesce(array_length(p_ids, 1), 0);
  n_distinct int := (select count(distinct pid) from unnest(p_ids) as pid);
  n_matched  int := (select count(*) from designs d where d.id = any(p_ids));
  n_designs  int := (select count(*) from designs);
begin
  if n_ids <> n_distinct or n_distinct <> n_matched or n_matched <> n_designs then
    raise exception 'reorder_designs: p_ids must list every design exactly once'
      using errcode = '22023';
  end if;

  update designs d
     set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where d.id = o.id;
end;
$$;

revoke all on function reorder_designs(uuid[]) from public;
revoke all on function reorder_designs(uuid[]) from anon;
grant execute on function reorder_designs(uuid[]) to authenticated;
