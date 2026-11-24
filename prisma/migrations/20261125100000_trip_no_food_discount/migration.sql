-- Optional per-trip amount (USD) deducted from the price of a pilgrim without food. New nullable column only.
ALTER TABLE "Trip" ADD COLUMN "noFoodDiscount" DECIMAL(14,2);
