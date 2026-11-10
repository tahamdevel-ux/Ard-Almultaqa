ALTER TABLE "Trip" ADD COLUMN "foodDefault" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sarfAmount" INTEGER,
  ADD COLUMN "agentCommission" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "tripHotelId" TEXT,
  ADD COLUMN "noHousing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "withFood" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sarfByPilgrim" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sarfAmount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "TripHotel" (
  "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "hotelId" TEXT NOT NULL, "noHousingPrice" INTEGER,
  CONSTRAINT "TripHotel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TripHotelPrice" (
  "id" TEXT NOT NULL, "tripHotelId" TEXT NOT NULL, "roomType" "RoomType" NOT NULL, "amount" INTEGER NOT NULL,
  CONSTRAINT "TripHotelPrice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TripAgentCommission" (
  "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "agentId" TEXT NOT NULL, "amount" INTEGER NOT NULL,
  CONSTRAINT "TripAgentCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TripHotel_tripId_hotelId_key" ON "TripHotel"("tripId","hotelId");
CREATE UNIQUE INDEX "TripHotelPrice_tripHotelId_roomType_key" ON "TripHotelPrice"("tripHotelId","roomType");
CREATE UNIQUE INDEX "TripAgentCommission_tripId_agentId_key" ON "TripAgentCommission"("tripId","agentId");
ALTER TABLE "TripHotel" ADD CONSTRAINT "TripHotel_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripHotel" ADD CONSTRAINT "TripHotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TripHotelPrice" ADD CONSTRAINT "TripHotelPrice_tripHotelId_fkey" FOREIGN KEY ("tripHotelId") REFERENCES "TripHotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripAgentCommission" ADD CONSTRAINT "TripAgentCommission_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripHotelId_fkey" FOREIGN KEY ("tripHotelId") REFERENCES "TripHotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing per-trip room prices become one priced hotel per trip (the trip's Makkah hotel, or a placeholder).
INSERT INTO "Hotel" ("id","officialName","city","mealsIncluded","updatedAt")
SELECT 'placeholder-hotel-unspecified','غير محدد','MAKKAH',true,CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "TripPrice" p JOIN "Trip" t ON t."id"=p."tripId" WHERE t."makkahHotelId" IS NULL);
INSERT INTO "TripHotel" ("id","tripId","hotelId")
SELECT gen_random_uuid()::text, t."id", COALESCE(t."makkahHotelId",'placeholder-hotel-unspecified')
FROM "Trip" t WHERE EXISTS (SELECT 1 FROM "TripPrice" p WHERE p."tripId"=t."id");
INSERT INTO "TripHotelPrice" ("id","tripHotelId","roomType","amount")
SELECT gen_random_uuid()::text, th."id", p."roomType", p."amount"
FROM "TripPrice" p JOIN "TripHotel" th ON th."tripId"=p."tripId";
UPDATE "Booking" b SET "tripHotelId"=th."id" FROM "TripHotel" th WHERE th."tripId"=b."tripId" AND b."priceAmount" IS NOT NULL;
