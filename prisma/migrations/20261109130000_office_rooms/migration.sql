CREATE TYPE "OfficeCategory" AS ENUM ('MEN', 'WOMEN', 'FAMILY');
CREATE TYPE "OfficeAssign" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "Agent" ADD COLUMN "roomCode" TEXT;
CREATE UNIQUE INDEX "Agent_roomCode_key" ON "Agent"("roomCode");

CREATE TABLE "OfficeRoom" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "code" TEXT,
  "seq" INTEGER NOT NULL,
  "capacity" INTEGER NOT NULL,
  "roomType" "RoomType",
  "category" "OfficeCategory" NOT NULL,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfficeRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfficeRoom_tripId_idx" ON "OfficeRoom"("tripId");
-- unique (tripId, code, seq) also for plain numbers (code NULL), which a plain unique constraint would not cover
CREATE UNIQUE INDEX "OfficeRoom_trip_code_seq_key" ON "OfficeRoom"("tripId", COALESCE("code", ''), "seq");
ALTER TABLE "OfficeRoom" ADD CONSTRAINT "OfficeRoom_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OfficeRoomMember" (
  "id" TEXT NOT NULL,
  "officeRoomId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "assignedBy" "OfficeAssign" NOT NULL DEFAULT 'AUTO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfficeRoomMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfficeRoomMember_bookingId_key" ON "OfficeRoomMember"("bookingId");
ALTER TABLE "OfficeRoomMember" ADD CONSTRAINT "OfficeRoomMember_officeRoomId_fkey" FOREIGN KEY ("officeRoomId") REFERENCES "OfficeRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeRoomMember" ADD CONSTRAINT "OfficeRoomMember_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
