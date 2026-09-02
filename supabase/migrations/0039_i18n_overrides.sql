-- 0039 — i18n_overrides: i testi NO/EN modificabili dal back office (ADR 0026).
--
-- ADDITIVA: una tabella nuova. Nessuna colonna alterata, nessun dato toccato.
-- Con la tabella VUOTA il sito pubblico è identico a oggi: il runtime legge i
-- file JSON e ci sovrappone gli override — senza righe non c'è nulla da
-- sovrapporre (AC3).
--
-- PK composita (locale, key): una riga sola per lingua e per chiave, e il
-- salvataggio dell'editor diventa un upsert ON CONFLICT invece di un
-- select-then-update.
--
-- `key` è la chiave PIATTA di next-intl ("cart.discount.badge"), non un path
-- annidato: il merge a runtime la risolve sull'albero dei messaggi.
--
-- Nessuna FK e nessun CHECK sulla lista delle chiavi: il set valido vive nei
-- file JSON del repo e cambia a ogni deploy — un vincolo SQL su quella lista
-- sarebbe sempre in ritardo di un deploy. La validazione (whitelist di
-- namespace + esistenza della chiave nei file di ENTRAMBE le lingue +
-- segnaposto ICU identici) sta nella server action, che è l'unico scrittore.
--
-- Nessuna funzione SQL qui → nessun `search_path` da fissare (lezione 0027).

create table if not exists i18n_overrides (
  locale     text        not null check (locale in ('no', 'en')),
  key        text        not null,
  value      text        not null,
  updated_at timestamptz not null default now(),
  primary key (locale, key)
);

comment on table i18n_overrides is
  'ADR 0026 — deviazioni ai testi di src/i18n/messages/*.json scritte dal back office. Riga assente = vale il file. R4-I18N.';
comment on column i18n_overrides.key is
  'Chiave piatta next-intl ("cart.discount.badge"). Deve esistere nei file di ENTRAMBE le lingue: lo garantisce la server action, non il DB.';

-- RLS: lettura pubblica (il merge gira nel render pubblico con il client ANON,
-- esattamente come i token del tema), scrittura solo authenticated (AC5).
-- Niente di segreto: questi testi sono stampati sulla pagina.
alter table i18n_overrides enable row level security;

create policy "i18n_overrides public read" on i18n_overrides
  for select to anon using (true);
create policy "i18n_overrides authenticated all" on i18n_overrides
  for all to authenticated using (true) with check (true);
