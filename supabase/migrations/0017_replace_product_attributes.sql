-- 0017_replace_product_attributes.sql — R2 polish (A1): make the admin attribute
-- "replace" ATOMIC. The previous delete-then-insert in the server action was two
-- statements: an insert failure after the delete left the product with NO
-- attributes. A function body runs in a single transaction, so delete+insert
-- here is all-or-nothing. SECURITY INVOKER (default) → the caller's RLS applies
-- (product_attributes: authenticated may write); execute is granted to
-- `authenticated` only, never anon.

create or replace function replace_product_attributes(
  p_product_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
as $$
begin
  delete from product_attributes where product_id = p_product_id;

  insert into product_attributes
    (product_id, key, label_no, label_en, value, value_num, sort_order)
  select
    p_product_id, r.key, r.label_no, r.label_en, r.value, r.value_num, r.sort_order
  from jsonb_to_recordset(p_rows) as r(
    key        text,
    label_no   text,
    label_en   text,
    value      text,
    value_num  int,
    sort_order int
  );
end;
$$;

revoke all on function replace_product_attributes(uuid, jsonb) from public;
grant execute on function replace_product_attributes(uuid, jsonb) to authenticated;

comment on function replace_product_attributes(uuid, jsonb) is
  'R2 A1: atomically replace a product''s typed attributes (delete + insert in one transaction). Called via rpc() from the authenticated admin action.';
