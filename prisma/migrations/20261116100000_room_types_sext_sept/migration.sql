-- Two more room types: سداسية (6 beds) and سباعية (7 beds). Additive only.
ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'SEXT';
ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'SEPT';
