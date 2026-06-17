-- 0012 — shipping address on orders (pre-launch).
-- Columns only, NULLABLE (no NOT NULL / no constraints): the "mandatory" rule
-- is still pending the client's confirmation (Alessio). The form already
-- collects address/zipcode/country; this lets the order persist them.

alter table orders
  add column if not exists address  text,
  add column if not exists zipcode  text,
  add column if not exists country  text;

-- create_order() grows three optional params (default '') so existing callers
-- keep working; the API passes the new fields. Old 6-arg signature is dropped.
drop function if exists create_order(text, text, text, text, text, jsonb);

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
      config_code, config_snapshot, quantity
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
      (it->>'quantity')::int
    );
  end loop;

  return v_code;
end;
$$;

-- trusted server only (the API uses the service role); anon must not call it
revoke all on function create_order(text, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function create_order(text, text, text, text, text, jsonb, text, text, text) to service_role;
