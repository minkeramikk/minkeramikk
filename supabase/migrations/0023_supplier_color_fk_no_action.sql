-- 0023_supplier_color_fk_no_action.sql — F35 fix (ADR 0018).
-- 0022 declared options.supplier_color_id as ON DELETE RESTRICT DEFERRABLE, but in
-- Postgres RESTRICT is NOT deferrable: its referential check always fires at
-- statement time, so `replace_supplier_colors`' `set constraints … deferred`
-- had no effect and the RPC's delete+reinsert-same-id cycle raised 23503 on the
-- DELETE. NO ACTION has the SAME "can't remove a referenced colour" guarantee
-- (immediate while INITIALLY IMMEDIATE) but IS deferrable, so the deferred check
-- at commit lets the atomic replace pass when every referenced colour is
-- reinserted with its id, and still raises 23503 when one is genuinely dropped.
-- Constraint name preserved (options_supplier_color_id_fkey) — the RPC's
-- `set constraints` references it by name. Additive, no reset.

alter table options drop constraint options_supplier_color_id_fkey;

alter table options
  add constraint options_supplier_color_id_fkey
  foreign key (supplier_color_id) references supplier_colors(id)
  on delete no action deferrable initially immediate;
