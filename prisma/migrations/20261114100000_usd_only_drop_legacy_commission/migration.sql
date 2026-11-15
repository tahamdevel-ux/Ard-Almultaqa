-- Bookings are priced in USD only. Refuse to migrate if a dinar-priced booking exists: it would need a hand conversion
-- (its payments' "credited" values are in dinars too), which must not be guessed here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Booking" WHERE "priceCurrency" <> 'USD') THEN
    RAISE EXCEPTION 'Bookings priced in IQD exist: convert them to USD (price and the credited value of their payments) before applying this migration';
  END IF;
END $$;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_priceCurrency_usd" CHECK ("priceCurrency" = 'USD');

-- The percentage / wholesale commission rules were replaced by a fixed per-pilgrim commission (trip / agent amounts).
ALTER TABLE "Agent" DROP COLUMN "commissionType", DROP COLUMN "commissionValue";
DROP TYPE "CommissionType";
