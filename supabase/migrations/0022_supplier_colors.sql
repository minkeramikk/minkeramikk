-- 0022_supplier_colors.sql — F35 (ADR 0018, revises ADR 0012 in part).
-- Colour options are normalised onto a per-supplier glaze palette: name/hex/swatch
-- live once in supplier_colors; kind=color options POINT at a palette row and stop
-- carrying their own name/hex/image (they arrive via join). kind=image untouched.
-- Additive + in-migration backfill (pre-launch, 0 real colour-option orders lost:
-- orders keep immutable snapshots). NEVER run with `db reset`.

-- ── palette table ───────────────────────────────────────────────────────────
create table supplier_colors (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references suppliers(id) on delete restrict,
  hex          text not null check (hex ~ '^#[0-9a-f]{6}$'),
  name         text not null,
  swatch_image text,                       -- real glaze photo (Storage); hex is the fallback (ADR 0012)
  active       boolean not null default true,
  sort_order   int not null default 0,
  unique (supplier_id, hex),
  unique (supplier_id, name)
);

create index supplier_colors_supplier_id on supplier_colors (supplier_id);

-- ── options → palette pointer ───────────────────────────────────────────────
-- DEFERRABLE is REQUIRED: replace_supplier_colors deletes+reinserts the whole
-- palette; with an immediate FK the DELETE statement would raise 23503 for any
-- colour in use even though it is reinserted with the same id before commit.
alter table options
  add column supplier_color_id uuid references supplier_colors(id)
    on delete restrict deferrable initially immediate;

-- ── backfill (order matters: card §4) ───────────────────────────────────────
-- 1. one palette row per (supplier, hex); on a hex shared by several designs the
--    FIRST by sort_order wins name+swatch (the others realign — intended effect).
--    lower(hex) EVERYWHERE: supplier_colors.hex has a lowercase-only CHECK, and
--    existing options.hex may carry uppercase (the dry-run report flags them).
insert into supplier_colors (supplier_id, hex, name, swatch_image, sort_order)
select supplier_id, hex, name, image, row_number() over (partition by supplier_id order by hex) - 1
from (
  select distinct on (d.supplier_id, lower(o.hex))
         d.supplier_id, lower(o.hex) as hex, o.name, o.image
  from options o
  join option_categories oc on oc.id = o.category_id
  join designs d on d.id = oc.design_id
  where oc.kind = 'color' and o.hex is not null
  order by d.supplier_id, lower(o.hex), o.sort_order, o.id
) first_per_hex;

-- 2. point each colour option at its palette row (match on supplier + lower(hex)).
--    NB: sc.hex = lower(o.hex) MUST live in WHERE, not in the join ON — the UPDATE
--    target `o` is not visible inside the ON of a FROM-join (Postgres 42P01).
update options o
set supplier_color_id = sc.id
from option_categories oc
join designs d on d.id = oc.design_id
join supplier_colors sc on sc.supplier_id = d.supplier_id
where o.category_id = oc.id
  and oc.kind = 'color'
  and o.hex is not null
  and sc.hex = lower(o.hex);

-- 3. drop the old image-or-hex CHECK (0005) and null the copied fields on colour
--    options — they now come from the join. options.name is NOT NULL by default.
alter table options drop constraint if exists options_image_or_hex_check;
alter table options alter column name drop not null;

update options o
set name = null, hex = null, image = null
from option_categories oc
where o.category_id = oc.id and oc.kind = 'color' and o.supplier_color_id is not null;

-- ── two-way form + same-supplier, enforced by trigger (cross-table → not a CHECK)
create function options_kind_shape() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  k text; design_supplier uuid; color_supplier uuid;
begin
  select kind into k from option_categories where id = new.category_id;
  if k = 'color' then
    if new.supplier_color_id is null then
      raise exception 'options: a colour option must reference a supplier_color';
    end if;
    select d.supplier_id into design_supplier
      from option_categories oc join designs d on d.id = oc.design_id
      where oc.id = new.category_id;
    select supplier_id into color_supplier from supplier_colors where id = new.supplier_color_id;
    if color_supplier is distinct from design_supplier then
      raise exception 'options: palette colour % belongs to a different supplier', new.supplier_color_id;
    end if;
  elsif k = 'image' then
    if new.supplier_color_id is not null then
      raise exception 'options: an image option must not reference a palette colour';
    end if;
    if new.image is null then
      raise exception 'options: an image option needs an image';
    end if;
  end if;
  return new;
end $$;

create trigger options_kind_shape_check
  before insert or update on options
  for each row execute function options_kind_shape();

-- ── uniqueness (0009): add per-category palette-colour uniqueness; the existing
--    (category_id, hex) / (category_id, name) indexes self-exempt via NULLs.
create unique index options_category_supplier_color_uniq
  on options (category_id, supplier_color_id)
  where supplier_color_id is not null;

-- ── atomic palette replace (CP4) — mirrors replace_product_attributes (0017) ──
create function replace_supplier_colors(p_supplier_id uuid, p_rows jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  -- Defer the options→palette FK for THIS transaction: colours in use are
  -- deleted and reinserted with the SAME id, so the check passes at commit.
  -- Genuinely removing a referenced colour still raises 23503 at commit →
  -- the action maps it to a friendly "deactivate instead" message (AC8, CP4).
  -- ⚠️ verify the auto-generated constraint name after writing the migration
  -- (expected: options_supplier_color_id_fkey — check with \d options).
  set constraints options_supplier_color_id_fkey deferred;
  delete from supplier_colors where supplier_id = p_supplier_id;
  insert into supplier_colors (id, supplier_id, hex, name, swatch_image, active, sort_order)
  select coalesce((r->>'id')::uuid, gen_random_uuid()), p_supplier_id,
         lower(r->>'hex'), r->>'name', nullif(r->>'swatch_image',''),
         coalesce((r->>'active')::boolean, true), (r->>'sort_order')::int
  from jsonb_array_elements(p_rows) as r;
end $$;
revoke all on function replace_supplier_colors(uuid, jsonb) from public;
grant execute on function replace_supplier_colors(uuid, jsonb) to authenticated;

-- ── RLS: public read (anon configurator resolves name/hex/swatch), auth writes ─
alter table supplier_colors enable row level security;
create policy "supplier_colors public read"
  on supplier_colors for select to anon using (true);
create policy "supplier_colors authenticated all"
  on supplier_colors for all to authenticated using (true) with check (true);
