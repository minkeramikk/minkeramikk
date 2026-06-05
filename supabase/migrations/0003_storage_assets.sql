-- 0003_storage_assets.sql — `assets` bucket (TODO 1.4).
-- Public read; writes only for authenticated users (back-office uploads)
-- and the service role (import script, which bypasses RLS).
-- Path convention (enforced by app code, documented here):
--   designs/{slug}/{category}/{file}.png
--   products/{slug}.png
-- Resizing happens on-the-fly via Supabase image transforms: no pre-generated variants.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

create policy "assets public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'assets');

create policy "assets authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'assets');

create policy "assets authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'assets')
  with check (bucket_id = 'assets');

create policy "assets authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'assets');
