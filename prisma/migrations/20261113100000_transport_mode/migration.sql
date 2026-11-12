CREATE TYPE "TransportMode" AS ENUM ('BUS', 'CAR', 'FLIGHT');
ALTER TABLE "Booking" ADD COLUMN "transport" "TransportMode";
ALTER TABLE "SeatAssignment" ADD COLUMN "flightId" TEXT;
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing air-trip pilgrims that were given a car keep it as an explicit CAR choice; everything else stays on the trip's default.
UPDATE "Booking" b SET "transport" = 'CAR' FROM "SeatAssignment" s WHERE s."bookingId" = b.id AND s."carId" IS NOT NULL;
