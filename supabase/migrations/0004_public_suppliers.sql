-- 0004_public_suppliers.sql — ADR 0009: supplier NAME is public, contacts are not.
-- Additive migration: exposes ONLY the safe fields (id, name, active) of ACTIVE
-- suppliers to the anon role, via a security_definer-style view (owner bypasses
-- the suppliers RLS, which stays authenticated-only for the full row).
-- email/phone/notes are never readable by anon.

create view public_suppliers
with (security_invoker = off) as
select id, name, active
from suppliers
where active;

comment on view public_suppliers is
  'Safe public projection of suppliers (ADR 0009): id/name/active of active rows only. Contacts stay authenticated-only.';

-- explicit grants (do not rely on default privileges)
revoke all on public_suppliers from anon, authenticated;
grant select on public_suppliers to anon, authenticated;
