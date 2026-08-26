-- R4-STEP3: up to 2 real photos per ceramic (step-3 product modal) + the series
-- heading the step-3 grid groups by. ADDITIVE: new table, two nullable columns.
-- Old code ignores both; new code degrades cleanly when they are empty.
-- Twin of design_images (0024 / ADR 0019); cap 2 is enforced in the server
-- action, like MAX_PHOTOS=8 there (ADR 0020).
create table if not exists product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  image      text not null,          -- Storage path in bucket "assets"
  sort_order int  not null default 0
);

create index if not exists product_images_product_id on product_images (product_id);

alter table product_images enable row level security;

-- Public catalog read (the anon configurator needs it, like design_images).
create policy "product_images public read" on product_images
  for select to anon using (true);

-- Back-office writes (0002/0021/0024 pattern).
create policy "product_images authenticated all" on product_images
  for all to authenticated using (true) with check (true);

-- Series shown as the step-3 group heading ("Sett", "Tallerkener", …).
-- Public text ⇒ double column _no/_en (AGENTS §i18n rule 4). NULL/empty =
-- ungrouped: the product falls into the trailing unlabelled section.
alter table products
  add column if not exists series_no text,
  add column if not exists series_en text;

comment on column products.series_no is
  'R4-STEP3: step-3 grid group heading (NO). NULL = ungrouped (trailing section).';
