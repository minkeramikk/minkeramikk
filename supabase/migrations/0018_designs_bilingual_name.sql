-- 0018_designs_bilingual_name.sql — R2-7: the DESIGN name becomes bilingual
-- (NO/EN), mirroring products.name_no/_en. Additive, no reset (real orders
-- exist). The legacy `designs.name` column is KEPT as a fallback for historic
-- order snapshots and any reader not yet migrated — dropping it is a future
-- refinement, deliberately out of scope here.

-- 1) add the two columns nullable so the backfill can run on existing rows
alter table designs add column name_no text;
alter table designs add column name_en text;

-- 2) backfill both from the single legacy name (no design is left without a
--    name); a NULL legacy name (shouldn't exist — it's NOT NULL) coalesces to ''
update designs set
  name_no = coalesce(name, ''),
  name_en = coalesce(name, '');

-- 3) lock them down: NOT NULL with an empty-string default for any in-transit
--    insert that omits them (the admin form always sends both)
alter table designs alter column name_no set default '';
alter table designs alter column name_en set default '';
alter table designs alter column name_no set not null;
alter table designs alter column name_en set not null;

-- RLS: UNCHANGED. The `designs` policies (0002_rls.sql) are table-level
-- ("public read active" / "authenticated all") — they apply to every column,
-- so the new columns inherit anon-read / auth-write with no new policy.
