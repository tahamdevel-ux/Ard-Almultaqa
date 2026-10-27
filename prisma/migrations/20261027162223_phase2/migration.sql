-- CreateEnum
CREATE TYPE "City" AS ENUM ('MAKKAH', 'MADINAH');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('DOUBLE', 'TRIPLE', 'QUAD', 'QUINT');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "visaExpiry" DATE,
ADD COLUMN     "visaIssue" DATE;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "firstCity" "City" NOT NULL DEFAULT 'MADINAH',
ADD COLUMN     "madinahHotelId" TEXT,
ADD COLUMN     "makkahHotelId" TEXT;

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "localName" TEXT,
    "city" "City" NOT NULL,
    "address" TEXT,
    "licenseNo" TEXT,
    "mealsIncluded" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "roomNo" TEXT NOT NULL,
    "type" "RoomType" NOT NULL,
    "beds" INTEGER NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAssignment" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "city" "City" NOT NULL,

    CONSTRAINT "RoomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transportType" "TransportType" NOT NULL,
    "nightsMakkah" INTEGER NOT NULL DEFAULT 0,
    "nightsMadinah" INTEGER NOT NULL DEFAULT 0,
    "firstCity" "City" NOT NULL DEFAULT 'MADINAH',
    "makkahHotelId" TEXT,
    "madinahHotelId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "busCount" INTEGER NOT NULL DEFAULT 0,
    "seatsPerBus" INTEGER NOT NULL DEFAULT 48,
    "durationDays" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_tripId_city_roomNo_key" ON "Room"("tripId", "city", "roomNo");

-- CreateIndex
CREATE UNIQUE INDEX "RoomAssignment_bookingId_city_key" ON "RoomAssignment"("bookingId", "city");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_makkahHotelId_fkey" FOREIGN KEY ("makkahHotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_madinahHotelId_fkey" FOREIGN KEY ("madinahHotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_makkahHotelId_fkey" FOREIGN KEY ("makkahHotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_madinahHotelId_fkey" FOREIGN KEY ("madinahHotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
