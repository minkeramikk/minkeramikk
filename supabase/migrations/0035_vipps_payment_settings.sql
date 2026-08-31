-- 0035 — Vipps payment details on `settings` (R4-TAKK, ADR 0008 pattern).
-- ADDITIVE: three nullable columns on the single settings row, no backfill.
--
-- The shop is paid by hand through Vipps: the thank-you page and the order
-- confirmation email SHOW these details, they never charge anything. All three
-- are nullable on purpose — NULL is the legitimate "not configured yet" state
-- and both surfaces drop the payment block entirely when nothing is set.
--
--   vipps_qr_image — Storage path in the `assets` bucket (like products.image),
--                    NOT a URL: assetUrl() resolves it at render time.
--   vipps_number   — the Vipps recipient number, free text (it is displayed,
--                    never parsed; leading zeros and spacing must survive).
--   vipps_link     — the https://qr.vipps.no/… address the QR encodes, kept so
--                    the shop can regenerate the image from its source.
--
-- No RLS change: `settings` already grants anon select on the whole row (0002)
-- and authenticated update; nothing here is secret — it is printed on the page.

alter table settings
  add column if not exists vipps_qr_image text,
  add column if not exists vipps_number   text,
  add column if not exists vipps_link     text;

comment on column settings.vipps_qr_image is
  'Storage path (assets bucket) of the Vipps QR image. NULL = payment block hidden. R4-TAKK.';
comment on column settings.vipps_number is
  'Vipps recipient number, shown as text beside the QR. R4-TAKK.';
comment on column settings.vipps_link is
  'The qr.vipps.no address the QR encodes (source of truth for regenerating it). R4-TAKK.';
