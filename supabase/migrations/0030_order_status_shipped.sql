-- 0030 — order lifecycle v2 (ADR 0021): add 'shipped' to order_status.
--
-- ADDITIVE and IDEMPOTENT. Alone in its own migration ON PURPOSE: Postgres
-- refuses to USE an enum value added in the same transaction, so any first use
-- (default, CHECK, data update) must land in a later file. 0031 only adds
-- columns, so nothing here is used before the transaction closes.
--
-- 'contacted' is NOT removed: removing an enum value means recreating the type,
-- which is a breaking, non-additive operation. It stays dormant, hidden by the
-- application (src/lib/orders/order-status.ts). Verified with Daniele 26/8:
-- zero 'contacted' rows on prod, so no remapping is needed.

alter type order_status add value if not exists 'shipped' after 'in_production';
