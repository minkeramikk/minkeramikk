-- 0007_order_seq.sql — F05 order submission. Additive (no reset).
--
-- Order code = 'MK-' || nextval('order_seq'). A Postgres sequence is
-- concurrency-safe by construction: two concurrent submits get two distinct
-- values, never a duplicate.
--
-- create_order(...) does the whole write in ONE transaction (a function body
-- is atomic): order row + one order_items row per cart line, with COMPLETE
-- snapshots (ADR 0005 prices as cents+currency; ADR 0007 supplier_id NOT NULL).
-- Returns the order code. SECURITY DEFINER + locked search_path; callable by
-- the trusted server (service role) only.

create sequence if not exists order_seq start 1001;

create or replace function create_order(
  p_customer_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_locale text,
  p_items jsonb
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

  insert into orders (code, customer_name, email, phone, message, locale, status)
  values (v_code, p_customer_name, p_email, p_phone, p_message, p_locale, 'new')
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
revoke all on function create_order(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function create_order(text, text, text, text, text, jsonb) to service_role;
