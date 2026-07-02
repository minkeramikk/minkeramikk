-- 0020 — security hardening: drop the public (anon) INSERT policies on orders.
--
-- Orders are created ONLY via the create_order() RPC (SECURITY DEFINER, execute
-- granted to service_role — see 0007). The old "public insert" policies (0002)
-- let anyone POST rows straight into orders/order_items using the public anon
-- key, bypassing the RPC + Turnstile → an easy spam vector for fake orders.
-- SELECT/UPDATE already require the authenticated role, so removing INSERT
-- leaves anon with no write path to these tables. The customer checkout is
-- unaffected: it runs server-side via the service-role client + create_order().
drop policy if exists "orders public insert" on orders;
drop policy if exists "order_items public insert" on order_items;
