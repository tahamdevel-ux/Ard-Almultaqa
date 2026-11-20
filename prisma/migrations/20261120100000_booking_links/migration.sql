-- «ارتباط»: colour-coded links between pilgrims of one trip. New tables only.
CREATE TABLE "BookingLink" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "colorIdx" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BookingLinkMember" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    CONSTRAINT "BookingLinkMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingLink_tripId_idx" ON "BookingLink"("tripId");
CREATE UNIQUE INDEX "BookingLinkMember_bookingId_key" ON "BookingLinkMember"("bookingId");
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingLinkMember" ADD CONSTRAINT "BookingLinkMember_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "BookingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingLinkMember" ADD CONSTRAINT "BookingLinkMember_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
