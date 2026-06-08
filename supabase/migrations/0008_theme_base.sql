-- 0008_theme_base.sql — F15 theme base. Additive (no reset).
--
-- The brand's 3 managed tokens (ADR 0008): the app reads the live colors from
-- the `settings` row, so updating that row is what re-themes the RUNNING site.
-- The "copycat" defaults of minkeramikk.no: rosa caldo / prugna / viola
-- (light / dark / accent). The ~20 derived tokens follow automatically via
-- color-mix in globals.css. The accent passes AA against white.
--
-- 0001 already seeds these values for a FRESH install; this migration brings an
-- already-provisioned database up to the new base.

update settings
set color_light  = '#fbe9e4',
    color_dark   = '#2b2330',
    color_accent = '#7d4f9c',
    updated_at   = now()
where id = 1;
