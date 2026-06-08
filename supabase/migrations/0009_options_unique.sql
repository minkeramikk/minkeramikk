-- 0009_options_unique.sql — F10 Passo 0: anti-duplicate guards on `options`
-- (the check the import report deferred to "before F10"). Additive, no reset.
--
-- Two unique indexes per category:
--   1. (category_id, hex) WHERE hex IS NOT NULL — a colour appears at most once
--      per category (image-only options, hex NULL, are exempt: a partial index).
--   2. (category_id, name) — option names are unique within a category.
--
-- Verified before authoring: the live `options` table has 0 duplicates on either
-- key (277 rows), so these indexes build cleanly. If a future dataset violates
-- them the build fails loudly (STOP) — clean the duplicates first, never widen
-- the constraint.
--
-- Indexes do not appear in the generated TypeScript types, so no type regen is
-- required for this migration.

create unique index if not exists options_category_hex_uniq
  on options (category_id, hex)
  where hex is not null;

create unique index if not exists options_category_name_uniq
  on options (category_id, name);
