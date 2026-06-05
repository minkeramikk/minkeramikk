-- 0005_layer_image.sql — ADR 0010: compositing assets are explicit data.
-- Additive: `options.layer_image` (Storage path of the pre-colored PNG used by
-- the multiply preview). `image` stays the DISPLAY asset (OptionCard thumb),
-- `hex` stays the swatch. layer_image is orthogonal to kind.
--
-- The old one-of CHECK (num_nonnulls(image,hex)=1) is replaced by a per-kind
-- rule: kind=image → image NOT NULL; kind=color → hex NOT NULL. The cross-table
-- kind lives on option_categories, so it cannot be a column CHECK on options;
-- the relationship is enforced by the importer/admin code (documented).

alter table options add column layer_image text;

-- drop the original one-of CHECK regardless of its auto-generated name
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.options'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%num_nonnulls%';
  if c is not null then
    execute format('alter table options drop constraint %I', c);
  end if;
end $$;

alter table options
  add constraint options_image_or_hex_check
  check (image is not null or hex is not null);

comment on column options.layer_image is
  'ADR 0010: Storage path of the pre-colored compositing PNG (multiply). Separate from image (display thumb) and hex (swatch).';
