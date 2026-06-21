-- 0014_designs_accepts_custom_notes.sql — R2-2a: shop marks a design as
-- "accepts custom colour notes". Additive, no reset (real orders exist —
-- AGENTS.md DB rule). Re-runnable.
--
-- The configurator shows the step-2 note block IFF this flag is true; the gate
-- is explicit per design (NOT auto-derived from kind=image), same shape as
-- R2-1a's is_default. Default off → the shop opts in; no backfill.

alter table designs
  add column if not exists accepts_custom_notes boolean not null default false;
