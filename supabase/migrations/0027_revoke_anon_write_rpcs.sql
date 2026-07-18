-- F39 — actually deny `anon` the write RPCs.
-- ADDITIVE: revokes only; creates and alters nothing. Old code is unaffected
-- (every caller of these four functions is an /admin server action running as
-- `authenticated` — verified by grep across src/).
--
-- WHY THIS EXISTS
-- The pattern we inherited from 0017/0021/0022 is
--     revoke all on function f(...) from public;
--     grant execute on function f(...) to authenticated;
-- and it does NOT deny anon on this project. Supabase grants EXECUTE to `anon`
-- as an explicit role grant (via default privileges), and revoking from PUBLIC
-- never touches an explicit grant. Measured against the linked database with the
-- anon key: all four functions executed with no error.
--
--   replace_product_attributes  → EXECUTED as anon
--   replace_design_products     → EXECUTED as anon
--   replace_supplier_colors     → EXECUTED as anon
--   reorder_products            → EXECUTED as anon
--
-- Nothing was corrupted, because all four are SECURITY INVOKER and RLS still
-- gates the underlying tables — anon's writes match zero rows. But that means
-- the only thing protecting these RPCs today is RLS; the grant line that looks
-- like a second layer is not one. The RLS test added with 0026 ("anon cannot
-- execute reorder_products") is what surfaced this.
--
-- SCOPE NOTE FOR REVIEW: only the reorder_products revoke belongs to card F39.
-- The other three close the same hole on pre-existing functions — they are here
-- because leaving a known anon-callable write RPC in place is not something to
-- defer to a later card, and because the fix is one line each with no caller
-- affected. Trim them if the TL wants F39 kept surgical.
revoke all on function reorder_products(uuid, uuid[]) from anon;
revoke all on function replace_product_attributes(uuid, jsonb) from anon;
revoke all on function replace_design_products(uuid, uuid[]) from anon;
revoke all on function replace_supplier_colors(uuid, jsonb) from anon;
