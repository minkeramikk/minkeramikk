-- 0002_rls.sql — Row Level Security per docs/adr/schema-er.md §notes:
--   catalog: public read (active/visible rows only), write authenticated
--   orders/order_items: public insert, select/update authenticated
--   suppliers: authenticated only (never public, ADR 0006)
--   settings: public read, authenticated write (ADR 0008)
-- No DELETE policies on orders/order_items: orders are immutable history
-- (service role bypasses RLS for trusted maintenance).

-- ──────────────────────── enable RLS everywhere ────────────────────────

alter table suppliers enable row level security;
alter table designs enable row level security;
alter table option_categories enable row level security;
alter table options enable row level security;
alter table settings enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- ───────────────────────────── suppliers ───────────────────────────────

create policy "suppliers authenticated all"
  on suppliers for all
  to authenticated
  using (true)
  with check (true);

-- ────────────────────────────── designs ────────────────────────────────

create policy "designs public read active"
  on designs for select
  to anon
  using (active);

create policy "designs authenticated all"
  on designs for all
  to authenticated
  using (true)
  with check (true);

-- ──────────────────────── option_categories ────────────────────────────
-- No active flag of its own: visibility follows the parent design app-side.

create policy "option_categories public read"
  on option_categories for select
  to anon
  using (true);

create policy "option_categories authenticated all"
  on option_categories for all
  to authenticated
  using (true)
  with check (true);

-- ────────────────────────────── options ────────────────────────────────

create policy "options public read active"
  on options for select
  to anon
  using (active);

create policy "options authenticated all"
  on options for all
  to authenticated
  using (true)
  with check (true);

-- ────────────────────────────── settings ───────────────────────────────

create policy "settings public read"
  on settings for select
  to anon, authenticated
  using (true);

create policy "settings authenticated update"
  on settings for update
  to authenticated
  using (true)
  with check (true);

-- ────────────────────────────── products ───────────────────────────────

create policy "products public read visible"
  on products for select
  to anon
  using (visible);

create policy "products authenticated all"
  on products for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────── orders ────────────────────────────────

create policy "orders public insert"
  on orders for insert
  to anon, authenticated
  with check (true);

create policy "orders authenticated read"
  on orders for select
  to authenticated
  using (true);

create policy "orders authenticated update"
  on orders for update
  to authenticated
  using (true)
  with check (true);

-- ──────────────────────────── order_items ──────────────────────────────

create policy "order_items public insert"
  on order_items for insert
  to anon, authenticated
  with check (true);

create policy "order_items authenticated read"
  on order_items for select
  to authenticated
  using (true);

create policy "order_items authenticated update"
  on order_items for update
  to authenticated
  using (true)
  with check (true);
