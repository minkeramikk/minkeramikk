-- F28 — Popular designs (ADR 0016): admin-curated featured entries for the
-- step-1 strip. One row = one curated configurator LINK: a config code
-- (kind='design' → lands on step 2 via ?code=) or a CA-3 set param
-- (kind='set' → lands on step 3 via ?step=3&set=). The thumb is PRE-composed
-- server-side at save time (compose-plate reuse) so the home serves ONE
-- image per card. Max 10 rows is an app-side gate in the server action
-- (clear message beats a trigger), not a DB constraint.

create table featured_configs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('design', 'set')),
  -- config code (kind=design) or CA-3 set param (kind=set); the catalog is
  -- the source of truth — rows are re-validated at read time and hidden from
  -- the home when they no longer resolve (ADR 0016).
  payload     text not null unique,
  -- optional custom label; fallback at render: design name / "Sett · N deler"
  label_no    text,
  label_en    text,
  -- Storage path of the pre-composed thumb (featured/<id>.webp)
  thumb_image text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- RLS (pattern 0002): the strip is public, curation is admin-only.
alter table featured_configs enable row level security;

create policy "featured_configs public read"
  on featured_configs for select
  to anon, authenticated
  using (true);

create policy "featured_configs authenticated write"
  on featured_configs for all
  to authenticated
  using (true) with check (true);

-- the strip reads ordered by sort_order on every (cached) render
create index featured_configs_sort_idx on featured_configs (sort_order);
