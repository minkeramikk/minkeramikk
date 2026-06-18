-- 0013_options_is_default.sql — R2-1a: shop-chosen cover colour per category.
-- Additive, no reset (real orders exist — AGENTS.md DB rule). Re-runnable.
--
-- Before this, the step-1 cover used each category's FIRST option by sort_order,
-- which forced the shop to reorder the customer-facing list to change the cover.
-- `is_default` decouples the cover from sort_order: the app prefers the flagged
-- option, falling back to first-by-sort_order when none is flagged.
--
-- Guard: at most ONE default per category at the DB level (a partial unique
-- index, same pattern as 0009). The app also clears the previous default before
-- setting a new one; the index is the safety net (23505 handled in the action).
--
-- Backfill: flag today's first ACTIVE option (by sort_order) per category, so the
-- cover of every design is IDENTICAL to before until the shop changes it. The
-- WHERE NOT EXISTS clause makes the backfill idempotent (a re-run is a no-op).
--
-- Indexes/columns: `is_default` IS in the generated types — regenerate or
-- hand-edit src/lib/supabase/types.ts (a later task).

alter table options
  add column if not exists is_default boolean not null default false;

create unique index if not exists options_one_default_per_category
  on options (category_id)
  where is_default;

-- Idempotent backfill: per category, flag the first active option by sort_order
-- (tie-break by id for determinism). Skips categories that already have a default.
with ranked as (
  select id,
         row_number() over (
           partition by category_id
           order by sort_order asc, id asc
         ) as rn
  from options
  where active
)
update options o
set is_default = true
from ranked r
where o.id = r.id
  and r.rn = 1
  and not exists (
    select 1 from options d
    where d.category_id = o.category_id and d.is_default
  );
