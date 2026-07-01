-- Health-check helpers for the daily keep-alive cron (/api/keepalive).
-- They expose the Postgres database size and the total Storage size so the cron
-- can log usage and alert near the Free-plan caps (500 MB DB, 1 GB Storage).
--
-- SECURITY DEFINER so the caller can read pg_database_size() and storage.objects
-- without owning them; EXECUTE is revoked from PUBLIC and granted ONLY to
-- service_role, so anon/authenticated can never call these over the data API.
-- Empty search_path + fully-qualified names (hardening).

create or replace function public.db_size_bytes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_database_size(pg_catalog.current_database());
$$;

create or replace function public.storage_size_bytes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects;
$$;

revoke all on function public.db_size_bytes() from public;
revoke all on function public.storage_size_bytes() from public;
grant execute on function public.db_size_bytes() to service_role;
grant execute on function public.storage_size_bytes() to service_role;
