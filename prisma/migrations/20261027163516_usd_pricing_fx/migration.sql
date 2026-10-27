-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "priceCurrency" SET DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "credited" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeRate" INTEGER;

-- AlterTable
ALTER TABLE "TripPrice" ALTER COLUMN "currency" SET DEFAULT 'USD';
UPDATE "Payment" SET "credited" = "amount";
