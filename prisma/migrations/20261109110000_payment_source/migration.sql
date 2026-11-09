CREATE TYPE "PaymentSource" AS ENUM ('DIRECT', 'AGENT');
ALTER TABLE "Payment" ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'DIRECT', ADD COLUMN "sourceAgentId" TEXT;
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");
