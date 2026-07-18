-- 0025_designs_accepts_custom_text.sql — F38: shop marks a design as
-- "accepts a customer-written inscription on the ceramic". Twin of
-- accepts_custom_notes (0014). Additive, no reset (real orders exist —
-- AGENTS.md DB rule). Re-runnable.
--
-- The configurator shows the step-2 inscription field IFF this flag is true;
-- the gate is explicit per design (Alessio decides per design, not auto-
-- derived). Default off → the shop opts in; no backfill.

alter table designs
  add column if not exists accepts_custom_text boolean not null default false;
