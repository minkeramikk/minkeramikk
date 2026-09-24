-- 0043_designs_text_positions_all_four.sql — R5-TEXT-POSITION follow-up
-- (post-review): `centre` and `back` are NOT implicit any more — a design
-- can genuinely not offer Centre (measured live: Krabbe shouldn't). Every
-- one of the four positions is now opt-in via this same column; 0042's
-- constraint only allowed `top`/`bottom` here, this widens it. Additive,
-- re-runnable; existing rows (empty or `{top,bottom}`) stay valid as-is —
-- nothing to backfill.

alter table designs
  drop constraint if exists designs_text_positions_check;

alter table designs
  add constraint designs_text_positions_check
  check (text_positions <@ array['top', 'bottom', 'centre', 'back']::text[]);
