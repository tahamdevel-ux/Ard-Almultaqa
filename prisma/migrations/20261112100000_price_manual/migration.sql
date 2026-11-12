ALTER TABLE "Booking" ADD COLUMN "priceManual" BOOLEAN NOT NULL DEFAULT false;
-- A price that differs from what the hotel table gives (room type price + تصريف المعتمر) was typed by hand: protect it.
UPDATE "Booking" b SET "priceManual" = true
WHERE b."priceAmount" IS NOT NULL
  AND (b."tripHotelId" IS NULL
       OR b."priceAmount" IS DISTINCT FROM (
            CASE WHEN b."noHousing" THEN (SELECT th."noHousingPrice" FROM "TripHotel" th WHERE th.id = b."tripHotelId")
                 ELSE (SELECT p."amount" FROM "TripHotelPrice" p WHERE p."tripHotelId" = b."tripHotelId" AND p."roomType"::text = b."roomType") END
            + b."sarfAmount"));
