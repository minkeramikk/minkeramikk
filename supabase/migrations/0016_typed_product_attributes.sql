-- 0016_typed_product_attributes.sql — R2-3+R2-4: evolve product attributes from
-- a free (label/value) model to a TYPED one. Known property types (weight,
-- diameter, dimensions) live in a CODE registry (extensible without a migration,
-- and reusable for other suppliers later); `custom` keeps the per-product label.
-- Additive: `product_attributes` is new/empty (0015), so no backfill — existing
-- rows (if any) default to key='custom'. Weight consolidates into key='weight'
-- (value_num = grams): the empty, unused `products.weight_g` column is dropped so
-- the future shipping calc (ADR 0015) has a single source — the `weight` attribute.

alter table product_attributes
  add column key       text not null default 'custom',
  add column value_num int null;

-- known-type labels come from the code registry; only `custom` carries its own
-- label, and numeric types carry value_num instead of value → all three nullable.
alter table product_attributes
  alter column label_no drop not null,
  alter column label_en drop not null,
  alter column value    drop not null;

comment on column product_attributes.key is
  'R2-3+R2-4: attribute type — weight | diameter | dimensions | custom. Validated app-side against the code registry (src/lib/catalog/product-attributes.ts).';
comment on column product_attributes.value_num is
  'R2-3+R2-4: numeric value for numeric types (weight in grams, diameter in mm). NULL for text/custom types.';

-- weight is now the `weight` attribute (value_num = grams); the empty column goes.
alter table products drop column weight_g;
