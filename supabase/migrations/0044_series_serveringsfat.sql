-- R5-FEEDBACK-COPY (AC2): the serving dishes' series heading reads
-- "Serveringsfat og skåler" (client review, 30/10). Data only, additive:
-- renames the old label wherever it is and pins the serving/bowl products
-- (same slug list as scripts/seed-series.mjs) to it, whatever they carry now.
update products
set series_no = 'Serveringsfat og skåler'
where series_no = 'Servering og skåler';

update products
set series_no = 'Serveringsfat og skåler',
    series_en = 'Serving & bowls'
where slug in (
  'bat-serveringsfat', 'bat-serveringsfat-sma', 'serveringsfat-liten', 'serveringsfat-stor',
  'salatskal', 'salatskal-stor', 'ildfastform-firkant'
);
