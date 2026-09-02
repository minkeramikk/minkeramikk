-- 0038 — Seller identity on `settings` (R4-PDF-CLIENTE, ADR 0008 pattern,
-- same shape as 0035's Vipps columns).
--
-- ADDITIVE: six nullable columns plus one boolean flag on the single settings
-- row, no backfill. The shop's real details are not known yet and there is no
-- back-office page for `settings` — a known gap — so these are filled in by
-- hand in SQL when they arrive. Until then every column is NULL and the
-- customer summary's footer is exactly the one it prints today: the PDF
-- degrades PER FIELD, never printing a label without a value.
--
--   seller_name           — legal name of the business, as it must appear on a
--                           document the customer keeps.
--   seller_address        — one free-text line (street, zip, city, country).
--   seller_org_number     — Norwegian organisasjonsnummer, displayed verbatim.
--   seller_vat_registered — see below.
--   seller_email          — public contact address (never the supplier's).
--   seller_phone          — public contact number.
--
-- ⚠️ `seller_vat_registered` DEFAULTS TO FALSE, and that default is the whole
-- point of the column. A business under the 50 000 kr threshold is NOT in
-- MVA-registeret, and printing "MVA 25 %" on a document while not registered
-- is illegal. The flag is therefore opt-in, set by hand only once registration
-- is a fact. While it is false the summary shows no VAT line at all.
--
-- The flag also governs the org number's suffix: an organisasjonsnummer is
-- printed followed by " MVA" ONLY for a VAT-registered entity — that is the
-- correct designation, and it is wrong (and equally illegal) without it.
--
-- Prices at minkeramikk.no INCLUDE VAT (the sale terms say so in both
-- languages), so when the line is shown the tax is SPLIT OUT of the total,
-- never added on top: the customer must never read an amount other than the
-- one they are about to pay on Vipps.
--
-- No RLS change: `settings` already grants anon select on the whole row (0002)
-- and authenticated update; nothing here is secret — it is printed on a
-- document the customer receives.

alter table settings
  add column if not exists seller_name           text,
  add column if not exists seller_address        text,
  add column if not exists seller_org_number     text,
  add column if not exists seller_vat_registered boolean not null default false,
  add column if not exists seller_email          text,
  add column if not exists seller_phone          text;

comment on column settings.seller_name is
  'Legal business name printed in the customer summary footer. NULL = line omitted. R4-PDF-CLIENTE.';
comment on column settings.seller_address is
  'Single-line postal address for the summary footer. NULL = line omitted. R4-PDF-CLIENTE.';
comment on column settings.seller_org_number is
  'Norwegian organisasjonsnummer, printed verbatim; suffixed " MVA" only when seller_vat_registered. R4-PDF-CLIENTE.';
comment on column settings.seller_vat_registered is
  'TRUE only once the business is in MVA-registeret. FALSE (the default) hides the VAT line: printing "MVA 25 %" while unregistered is illegal. R4-PDF-CLIENTE.';
comment on column settings.seller_email is
  'Public contact email for the summary footer. NULL = omitted. R4-PDF-CLIENTE.';
comment on column settings.seller_phone is
  'Public contact phone for the summary footer. NULL = omitted. R4-PDF-CLIENTE.';

-- Seed dell'identità venditore — dati forniti da Alessio via Daniele, 2/9.
-- org.nr 930646636: MOD11 verificato.
-- seller_vat_registered resta FALSE finché Alessio non conferma l'iscrizione
-- al MVA-registeret: con false la riga «Herav MVA 25 %» NON viene stampata,
-- che è l'unico stato lecito quando lo stato di registrazione è ignoto.
update settings set
  seller_name           = 'Alessio Attanasio Italianinoslo',
  seller_address        = 'Thorvald Meyers gate 5, 0555 Oslo',
  seller_org_number     = '930646636',
  seller_vat_registered = false,
  seller_email          = 'bestilling@minkeramikk.no',
  seller_phone          = '96816644';
