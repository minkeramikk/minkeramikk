-- 0011_product_pieces.sql — F29: some "ceramics" are actually sets of N pieces.
-- Recognising them by name would be fragile, so the count becomes data and the
-- "Sett · N deler" badge derives from it. Additive, backward-compatible:
-- existing products default to 1 (single item). Price semantics are unchanged —
-- `price_cents` was always the price of the whole product (set included).

alter table products
  add column pieces int not null default 1
  check (pieces >= 1);

comment on column products.pieces is
  'F29: number of pieces in the product. 1 = single item; >1 = set, shown as "Sett · N deler". Does not affect price (price_cents is already per-product).';
