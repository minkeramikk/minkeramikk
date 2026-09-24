-- R5-KIT: a third curated link kind; lands on step 2 via ?kit=
alter table featured_configs drop constraint featured_configs_kind_check;
alter table featured_configs add constraint featured_configs_kind_check check (kind in ('design', 'set', 'kit'));
