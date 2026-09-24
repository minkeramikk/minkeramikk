-- 0042_designs_text_positions.sql — R5-TEXT-POSITION: which of top/bottom a
-- design offers as an arc inscription. `centre` and `back` are always implicit
-- and never listed here (0.1-5) — the empty array is a valid, common design.
-- The «Tekst» option group stays in the catalogue, empty (GARANZIA §7): it no
-- longer governs anything, this column does. Additive, re-runnable.

alter table designs
  add column if not exists text_positions text[] not null default '{}';

alter table designs
  drop constraint if exists designs_text_positions_check;

alter table designs
  add constraint designs_text_positions_check
  check (text_positions <@ array['top', 'bottom']::text[]);
