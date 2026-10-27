-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('IQD', 'USD');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "priceAmount" INTEGER,
ADD COLUMN     "priceCurrency" "Currency" NOT NULL DEFAULT 'IQD';

-- CreateTable
CREATE TABLE "TripPrice" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "roomType" "RoomType" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'IQD',
    "amount" INTEGER NOT NULL,

    CONSTRAINT "TripPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "receiptNo" SERIAL NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paidAt" DATE NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "note" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripPrice_tripId_roomType_key" ON "TripPrice"("tripId", "roomType");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- AddForeignKey
ALTER TABLE "TripPrice" ADD CONSTRAINT "TripPrice_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
