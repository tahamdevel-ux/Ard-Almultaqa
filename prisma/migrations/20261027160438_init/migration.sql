-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REGISTRATION', 'HOUSING', 'ACCOUNTANT', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('PASSPORT', 'PHOTO', 'NATIONAL_ID', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FIXED_WHOLESALE');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('UMRAH');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('LAND', 'AIR');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('OPEN', 'FULL', 'TRAVELLING', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'MOVED');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('NOT_SUBMITTED', 'IN_PROGRESS', 'ISSUED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('FAMILY', 'COMPANIONS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officeName" TEXT,
    "phones" TEXT[],
    "address" TEXT,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENT',
    "commissionValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyGroup" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "kind" "GroupKind" NOT NULL DEFAULT 'FAMILY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pilgrim" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "grandfatherName" TEXT NOT NULL,
    "greatGrandfatherName" TEXT,
    "familyName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "birthDate" DATE NOT NULL,
    "motherName" TEXT,
    "governorate" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "emergencyPhone" TEXT,
    "passportNo" TEXT NOT NULL,
    "enGivenName" TEXT NOT NULL,
    "enFatherName" TEXT,
    "enGrandfatherName" TEXT,
    "enSurname" TEXT NOT NULL,
    "nationality" TEXT NOT NULL DEFAULT 'IRAQI',
    "placeOfBirth" TEXT,
    "passportIssue" DATE,
    "passportExpiry" DATE NOT NULL,
    "passportAuthority" TEXT,
    "mahramId" TEXT,
    "mahramRelation" TEXT,
    "familyGroupId" TEXT,
    "chronicIllness" BOOLEAN NOT NULL DEFAULT false,
    "wheelchair" BOOLEAN NOT NULL DEFAULT false,
    "elderly" BOOLEAN NOT NULL DEFAULT false,
    "healthNotes" TEXT,
    "agentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pilgrim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilgrimDocument" (
    "id" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilgrimDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "tripNo" TEXT NOT NULL,
    "programType" "ProgramType" NOT NULL DEFAULT 'UMRAH',
    "transportType" "TransportType" NOT NULL,
    "name" TEXT NOT NULL,
    "departDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "nightsMakkah" INTEGER NOT NULL DEFAULT 0,
    "nightsMadinah" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL,
    "supervisorId" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'OPEN',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "company" TEXT,
    "seatCount" INTEGER NOT NULL DEFAULT 48,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "flightNo" TEXT NOT NULL,
    "airline" TEXT,
    "departAt" TIMESTAMP(3),
    "arriveAt" TIMESTAMP(3),
    "ticketCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundCar" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "GroundCar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "agentId" TEXT,
    "roomType" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
    "movedFromId" TEXT,
    "visaStatus" "VisaStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "visaNo" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingGroupMember" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "BookingGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatAssignment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "busId" TEXT,
    "seatNo" INTEGER,
    "ticketNo" TEXT,
    "carId" TEXT,

    CONSTRAINT "SeatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginAttempt_username_at_idx" ON "LoginAttempt"("username", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Pilgrim_passportNo_key" ON "Pilgrim"("passportNo");

-- CreateIndex
CREATE INDEX "Pilgrim_phone_idx" ON "Pilgrim"("phone");

-- CreateIndex
CREATE INDEX "Pilgrim_familyName_idx" ON "Pilgrim"("familyName");

-- CreateIndex
CREATE INDEX "PilgrimDocument_pilgrimId_idx" ON "PilgrimDocument"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_tripNo_key" ON "Trip"("tripNo");

-- CreateIndex
CREATE INDEX "Booking_tripId_idx" ON "Booking"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_pilgrimId_tripId_key" ON "Booking"("pilgrimId", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingGroupMember_bookingId_groupId_key" ON "BookingGroupMember"("bookingId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatAssignment_bookingId_key" ON "SeatAssignment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatAssignment_busId_seatNo_key" ON "SeatAssignment"("busId", "seatNo");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_name_key" ON "ImportMapping"("name");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_mahramId_fkey" FOREIGN KEY ("mahramId") REFERENCES "Pilgrim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimDocument" ADD CONSTRAINT "PilgrimDocument_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundCar" ADD CONSTRAINT "GroundCar_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingGroupMember" ADD CONSTRAINT "BookingGroupMember_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingGroupMember" ADD CONSTRAINT "BookingGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatAssignment" ADD CONSTRAINT "SeatAssignment_carId_fkey" FOREIGN KEY ("carId") REFERENCES "GroundCar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
