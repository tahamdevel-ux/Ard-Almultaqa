-- Receipts show the trip and booking price as they were when the payment was recorded.
ALTER TABLE "Payment" ADD COLUMN "tripId" TEXT, ADD COLUMN "bookingPrice" INTEGER;

-- Backfill from the current booking ...
UPDATE "Payment" p SET "tripId" = b."tripId", "bookingPrice" = b."priceAmount" FROM "Booking" b WHERE b.id = p."bookingId";

-- ... and for payments made before the pilgrim was moved (the move creates the new booking after them), use the booking he moved from.
UPDATE "Payment" p SET "tripId" = o."tripId"
FROM "Booking" b JOIN "Booking" o ON o.id = b."movedFromId"
WHERE b.id = p."bookingId" AND p."createdAt" < b."createdAt";
