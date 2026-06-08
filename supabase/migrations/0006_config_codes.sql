-- 0006_config_codes.sql — ADR 0011: persisted, stable codes for the config code.
-- Additive only (no db reset). Columns start NULL and are backfilled by
-- scripts/backfill-codes.ts (deterministic, idempotent); future imports assign
-- codes too. Codes are NEVER recalculated once set.
--
--   designs.code   — short, stable, globally UNIQUE (the <D> segment)
--   options.code   — short, stable, UNIQUE per category (the <sK> segment)
--
-- UNIQUE on a nullable column still allows many NULLs (pre-backfill), so this
-- migration is safe to apply before the codes exist.

alter table designs add column code text;
alter table designs add constraint designs_code_key unique (code);

alter table options add column code text;
alter table options add constraint options_category_code_key unique (category_id, code);

comment on column designs.code is
  'ADR 0011: short stable unique code, the <D> segment of the config code. Never recalculated.';
comment on column options.code is
  'ADR 0011: short stable code, unique per category, a config-code segment. Never recalculated.';
