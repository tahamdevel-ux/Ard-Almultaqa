-- Money may have cents: whole-number columns become DECIMAL(14,2). Existing values are kept as they are (1500 -> 1500.00).
ALTER TABLE "Trip" ALTER COLUMN "sarfAmount" TYPE DECIMAL(14,2), ALTER COLUMN "agentCommission" TYPE DECIMAL(14,2);
ALTER TABLE "Booking" ALTER COLUMN "priceAmount" TYPE DECIMAL(14,2), ALTER COLUMN "sarfAmount" TYPE DECIMAL(14,2);
ALTER TABLE "TripHotel" ALTER COLUMN "noHousingPrice" TYPE DECIMAL(14,2);
ALTER TABLE "TripHotelPrice" ALTER COLUMN "amount" TYPE DECIMAL(14,2);
ALTER TABLE "TripAgentCommission" ALTER COLUMN "amount" TYPE DECIMAL(14,2);
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DECIMAL(14,2), ALTER COLUMN "bookingPrice" TYPE DECIMAL(14,2);
