ALTER TABLE "OfficeRoom" ADD COLUMN "tripHotelId" TEXT, ADD COLUMN "makkahHotelRoomNo" TEXT, ADD COLUMN "madinahHotelRoomNo" TEXT;
ALTER TABLE "OfficeRoom" ADD CONSTRAINT "OfficeRoom_tripHotelId_fkey" FOREIGN KEY ("tripHotelId") REFERENCES "TripHotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- existing rooms: take the hotel of their first member
UPDATE "OfficeRoom" r SET "tripHotelId" = (SELECT b."tripHotelId" FROM "OfficeRoomMember" m JOIN "Booking" b ON b.id=m."bookingId" WHERE m."officeRoomId"=r.id AND b."tripHotelId" IS NOT NULL LIMIT 1);
