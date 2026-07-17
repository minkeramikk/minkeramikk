-- F36: lifestyle photo gallery per design (step 2 filmstrip).
-- Owned assets live under Storage `design-photos/<slug>/<uuid>.<ext>` (F26 class "design-photos", 1024w).
create table if not exists design_images (
  id         uuid primary key default gen_random_uuid(),
  design_id  uuid not null references designs (id) on delete cascade,
  image      text not null,          -- Storage path in bucket "assets"
  sort_order int  not null default 0
);

create index if not exists design_images_design_id on design_images (design_id);

alter table design_images enable row level security;

-- Public catalog read (no `active` column → all rows readable).
create policy "design_images public read" on design_images
  for select to anon using (true);

-- Back-office writes (same as other catalog tables, 0002/0021 pattern).
create policy "design_images authenticated all" on design_images
  for all to authenticated using (true) with check (true);
