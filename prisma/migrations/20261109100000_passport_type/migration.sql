CREATE TYPE "PassportType" AS ENUM ('IRAQI', 'FOREIGN');
ALTER TABLE "Pilgrim" ADD COLUMN "passportType" "PassportType" NOT NULL DEFAULT 'IRAQI';
