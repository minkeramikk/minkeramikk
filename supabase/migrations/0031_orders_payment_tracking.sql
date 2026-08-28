-- 0031 — payment register + shipping tracking on orders (ADR 0021).
-- ADDITIVE: two nullable columns, no constraint, no backfill.
--
-- paid_at: NULL = unpaid, timestamp = payment registered by the admin
-- ("Register payment"). Deliberately NOT an enum and NOT a deposit flag:
-- the shop registers one fact, "the money arrived, when".
-- tracking_code: carrier code typed by hand, quoted in the shipping email.
--
-- No index: single-shop volume, and the list is already served by
-- orders (status, created_at desc).

alter table orders
  add column if not exists paid_at       timestamptz,
  add column if not exists tracking_code text;

comment on column orders.paid_at is
  'Payment registered by the admin (NULL = unpaid). ADR 0021.';
comment on column orders.tracking_code is
  'Carrier tracking code, entered by hand before moving to shipped. ADR 0021.';
