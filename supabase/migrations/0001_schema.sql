-- 0001_schema.sql — normative schema from docs/adr/schema-er.md
-- (ADR 0004 unified catalog, ADR 0005 Money, ADR 0006/0007 suppliers, ADR 0008 theme).
-- Naming: english, snake_case. Do not edit applied migrations: add new ones.

-- ───────────────────────────── enum ─────────────────────────────

create type order_status as enum (
  'new', 'contacted', 'confirmed', 'in_production', 'delivered', 'cancelled'
);

-- ─────────────────────────── suppliers ──────────────────────────
-- Operational registry, never exposed publicly (ADR 0006).

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  notes      text,
  active     boolean not null default true,
  sort_order integer not null default 0
);

-- ──────────────────────────── designs ───────────────────────────

create table designs (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references suppliers (id) on delete restrict,
  slug           text not null unique,
  name           text not null, -- proper name, not translated
  description_no text,
  description_en text,
  preview_image  text,
  sort_order     integer not null default 0,
  active         boolean not null default true
);

create index designs_supplier_id_idx on designs (supplier_id);

-- ─────────────────────── option_categories ──────────────────────

create table option_categories (
  id         uuid primary key default gen_random_uuid(),
  design_id  uuid not null references designs (id) on delete cascade,
  slug       text not null,
  label_no   text,
  label_en   text,
  kind       text not null check (kind in ('image', 'color')),
  layer_slot text, -- base|mid|top|extra|detail|animal (documented values)
  sync_group text, -- nullable — color lock (ADR 0004)
  sort_order integer not null default 0,
  unique (design_id, slug)
);

create index option_categories_design_id_idx on option_categories (design_id);

-- ──────────────────────────── options ───────────────────────────
-- image set when category kind=image, hex set when kind=color:
-- realized as a one-of CHECK (cross-table kind match is enforced in app code).

create table options (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references option_categories (id) on delete cascade,
  name        text not null,
  image       text,
  hex         text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  check (num_nonnulls(image, hex) = 1)
);

create index options_category_id_idx on options (category_id);

-- ──────────────────────────── settings ──────────────────────────
-- Single row with the 3 theme tokens (ADR 0008).

create table settings (
  id           integer primary key check (id = 1),
  color_light  text not null,
  color_dark   text not null,
  color_accent text not null,
  updated_at   timestamptz not null default now()
);

insert into settings (id, color_light, color_dark, color_accent)
values (1, '#fdf0e6', '#181512', '#de7361');

-- ──────────────────────────── products ──────────────────────────

create table products (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  supplier_id    uuid not null references suppliers (id) on delete restrict,
  name_no        text not null,
  name_en        text not null,
  description_no text,
  description_en text,
  price_cents    integer not null, -- minor units (ADR 0005)
  currency       char(3) not null default 'NOK', -- ISO 4217
  image          text,
  visible        boolean not null default true,
  sort_order     integer not null default 0
);

create index products_supplier_id_idx on products (supplier_id);

-- ───────────────────────────── orders ───────────────────────────

create table orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique, -- e.g. MK-2606
  customer_name  text not null,
  email          text not null,
  phone          text,
  message        text,
  locale         text not null check (locale in ('no', 'en')), -- customer email language
  status         order_status not null default 'new',
  internal_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index orders_status_created_at_idx on orders (status, created_at desc);
create index orders_email_idx on orders (email);

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();

-- ─────────────────────────── order_items ────────────────────────
-- Orders are immutable history: snapshots survive catalog changes.
-- supplier_id is a historical fact of the row (NOT NULL, RESTRICT — ADR 0007).

create table order_items (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references orders (id) on delete cascade,
  supplier_id            uuid not null references suppliers (id) on delete restrict,
  supplier_name_snapshot text not null,
  product_id             uuid references products (id) on delete set null,
  product_name_snapshot  text not null,
  price_cents_snapshot   integer not null,
  currency_snapshot      char(3) not null,
  config_code            text, -- new format (ADR 0002), reloadable
  config_snapshot        jsonb, -- human-readable summary of the configuration
  quantity               integer not null
);

create index order_items_order_id_idx on order_items (order_id);
create index order_items_supplier_id_idx on order_items (supplier_id);
create index order_items_config_code_idx on order_items (config_code);
