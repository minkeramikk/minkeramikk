-- 0033 — R4-SCONTI hotfix: give replace_discount_tiers/replace_discount_products
-- a WHERE clause (found in Task 7, root-caused by the controller).
--
-- This Supabase project has `pg_safeupdate` enabled, which rejects an
-- unqualified DELETE with SQLSTATE 21000 ("DELETE requires a WHERE clause").
-- Every other replace_* function in the project's history scopes its delete by
-- a parent key (0021 replace_design_products: `where design_id = p_design_id`;
-- 0017 replace_product_attributes; 0022 replace_supplier_colors — same
-- pattern), because those tables are children of a parent row. discount_tiers
-- and discount_products are the first GLOBAL config tables this project's
-- "replace everything" pattern was applied to: they have no parent key to
-- scope by, so 0032's `delete from discount_tiers;` / `delete from
-- discount_products;` came out unqualified and pg_safeupdate blocks them.
-- `where true` is the explicit, intentional statement that a full replace is
-- what's meant — not a leftover WHERE-less delete.
--
-- 0032 is ALREADY APPLIED on staging (rqhsb…): both tables exist, seeded with
-- Alessio's confirmed scale, discovered by Task 7's own integration tests
-- failing against it. Supabase tracks applied migrations by filename, so
-- editing 0032 in place would never re-run there and would leave the file
-- disagreeing with the live database — this is a follow-up file, not an edit.
--
-- Same signatures as 0032 (`create or replace`), so no drop, no caller change.
-- `create or replace` preserves the existing grants, but the revoke/grant pair
-- is re-stated below anyway so this file stays self-describing.
--
-- PM sequence: make db-push-staging first (unblocks Task 7's save actions and
-- its integration tests), then make db-status, then make db-push-prod before
-- the merge, same order as 0032's own header.

create or replace function replace_discount_tiers(p_rows jsonb)
returns void
language plpgsql
as $$
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'replace_discount_tiers: p_rows must be a json array';
  end if;
  delete from discount_tiers where true;
  insert into discount_tiers (min_qty, pct, sort_order)
  select (r->>'min_qty')::int, (r->>'pct')::int, coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r;
end;
$$;

revoke all on function replace_discount_tiers(jsonb) from public;
grant execute on function replace_discount_tiers(jsonb) to authenticated;

comment on function replace_discount_tiers(jsonb) is
  'ADR 0022: atomically replace the global discount tier scale (delete + insert in one transaction). where true is explicit: this table has no parent key, and pg_safeupdate rejects an unqualified DELETE. Called via rpc() from the authenticated admin action.';

create or replace function replace_discount_products(p_product_ids uuid[])
returns void
language plpgsql
as $$
begin
  delete from discount_products where true;
  insert into discount_products (product_id)
  select pid from unnest(p_product_ids) as pid;
end;
$$;

revoke all on function replace_discount_products(uuid[]) from public;
grant execute on function replace_discount_products(uuid[]) to authenticated;

comment on function replace_discount_products(uuid[]) is
  'ADR 0022: atomically replace the discount-inclusion product list (delete + insert in one transaction). where true is explicit: this table has no parent key, and pg_safeupdate rejects an unqualified DELETE. No rows = every product included. Called via rpc() from the authenticated admin action.';
