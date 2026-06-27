-- 0015_product_attributes.sql — R2-4a: products describe themselves with
-- free-form, admin-managed attributes (dimensions, weight, material…). The
-- decision (Daniele 2026-06-20) is "evolutions as DATA, not schema": one row
-- per attribute in a dedicated table, NOT one column per property on products.
-- Labels are bilingual PER product (label_no/label_en + value) — no global
-- definition catalogue yet (small catalogue, max flexibility; a catalogue is a
-- future refinement, out of scope). Additive, no reset (real orders exist).

create table product_attributes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  label_no    text not null,
  label_en    text not null,
  value       text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS (pattern 0002): the catalogue is public-read, curation is admin-only —
-- mirrors products/options exactly.
alter table product_attributes enable row level security;

create policy "product_attributes public read"
  on product_attributes for select
  to anon
  using (true);

create policy "product_attributes authenticated all"
  on product_attributes for all
  to authenticated
  using (true) with check (true);

-- the catalogue read fetches a product's attributes ordered by sort_order
create index product_attributes_product_idx
  on product_attributes (product_id, sort_order);

-- R2-4 (Daniele 2026-06-21): structured weight in grams, parked for the future
-- shipping calculation (ADR 0015). Nullable — admin fills it when known; not a
-- free-text attribute, and NOT shown publicly yet (no shipping feature today).
alter table products
  add column weight_g int check (weight_g is null or weight_g >= 0);

comment on column products.weight_g is
  'R2-4: structured product weight in grams, for the future shipping calc (ADR 0015). Nullable; admin-entered; not displayed publicly.';
