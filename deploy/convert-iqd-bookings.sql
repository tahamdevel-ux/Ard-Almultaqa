-- One-off: convert bookings priced in dinars (IQD) to USD BEFORE deploying the "USD only" migration
-- (that migration refuses to run while a dinar-priced booking exists).
--
--   DRY RUN (default, changes nothing, prints what would change):
--     psql "$DATABASE_URL" -v rate=1400 -f deploy/convert-iqd-bookings.sql
--   APPLY:
--     psql "$DATABASE_URL" -v rate=1400 -v apply=1 -f deploy/convert-iqd-bookings.sql
--
-- rate = dinars per 1 USD, a WHOLE number: the one you want these old bookings converted at.
-- What it does, in one transaction, for every booking with priceCurrency = 'IQD':
--   * price  -> price / rate (whole dollars while the database still has integer prices, cents once it has DECIMAL)
--   * payments made in USD   -> credited = the dollars paid, no exchange rate
--   * payments made in IQD   -> credited = dinars / rate, exchangeRate = rate
--   * priceCurrency -> 'USD'
-- Back up the database first. Receipts already printed keep showing the old numbers on paper.
\set ON_ERROR_STOP on
\if :{?rate} \else \echo 'Pass -v rate=<dinars per dollar>' \quit \endif
\if :{?apply} \else \set apply 0 \endif

BEGIN;
CREATE TEMP TABLE converting ON COMMIT DROP AS SELECT id FROM "Booking" WHERE "priceCurrency" = 'IQD';

\echo '--- before: IQD bookings and what they have received (in dinars) ---'
SELECT b.id, b."priceAmount" AS price_iqd,
       COALESCE(SUM(CASE WHEN p.kind = 'PAYMENT' THEN p.credited ELSE -p.credited END), 0) AS paid_iqd
FROM "Booking" b LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE b.id IN (SELECT id FROM converting) GROUP BY b.id ORDER BY b.id;

-- payments first (they are found through the booking's still-IQD currency)
UPDATE "Payment" p SET
  credited = CASE WHEN p.currency = 'USD' THEN p.amount ELSE round(p.amount::numeric / :rate, 2) END,
  "exchangeRate" = CASE WHEN p.currency = 'USD' THEN NULL ELSE :rate END
FROM "Booking" b WHERE b.id = p."bookingId" AND b."priceCurrency" = 'IQD';

UPDATE "Booking" SET "priceAmount" = round("priceAmount"::numeric / :rate, 2), "priceCurrency" = 'USD'
WHERE "priceCurrency" = 'IQD';

\echo '--- after: the same bookings in USD ---'
SELECT b.id, b."priceAmount" AS price_usd,
       COALESCE(SUM(CASE WHEN p.kind = 'PAYMENT' THEN p.credited ELSE -p.credited END), 0) AS paid_usd
FROM "Booking" b LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE b.id IN (SELECT id FROM converting) GROUP BY b.id ORDER BY b.id;

\if :apply
  \echo 'APPLIED'
  COMMIT;
\else
  \echo 'DRY RUN: rolled back, nothing changed (add -v apply=1 to apply)'
  ROLLBACK;
\endif
