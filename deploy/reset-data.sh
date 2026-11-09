#!/usr/bin/env bash
# Run ON THE SERVER: wipes the business data (trips, pilgrims, bookings, payments, rooms, seats, audit log, uploaded import files)
# so the staff can start from zero. KEEPS: users and passwords, settings, agents, hotels, templates, saved import mappings.
# A compressed backup is written first. Usage:  bash /opt/ard-almultaqa/deploy/reset-data.sh
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="/root/ard-before-reset-$STAMP.sql.gz"

echo "هذا الأمر يمسح كل الرحلات والمعتمرين والحجوزات والدفعات والسجل من هذا السيرفر."
echo "يبقى: المستخدمون وكلمات السر، الإعدادات، الوكلاء، الفنادق، القوالب."
read -r -p "اكتب RESET للمتابعة: " ANSWER
[ "$ANSWER" = "RESET" ] || { echo "تم الإلغاء، لم يتغير شيء."; exit 1; }

echo "نسخة احتياطية أولاً: $BACKUP"
docker compose exec -T db pg_dump -U ard ard | gzip > "$BACKUP"
[ -s "$BACKUP" ] || { echo "فشلت النسخة الاحتياطية، لم يُمسح شيء."; exit 1; }

docker compose exec -T db psql -U ard -d ard -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
TRUNCATE TABLE
  "Payment", "OfficeRoomMember", "OfficeRoom", "RoomAssignment", "Room", "SeatAssignment",
  "BookingGroupMember", "FamilyGroup", "Booking", "Bus", "Flight", "GroundCar", "TripPrice", "Trip",
  "PilgrimDocument", "Pilgrim", "AuditLog", "StoredFile"
  RESTART IDENTITY CASCADE;
COMMIT;
SELECT 'Pilgrim' AS "table", count(*) FROM "Pilgrim" UNION ALL SELECT 'Trip', count(*) FROM "Trip" UNION ALL SELECT 'Payment', count(*) FROM "Payment"
UNION ALL SELECT 'User (kept)', count(*) FROM "User" UNION ALL SELECT 'Agent (kept)', count(*) FROM "Agent" UNION ALL SELECT 'Hotel (kept)', count(*) FROM "Hotel";
SQL

echo "تم التصفير. النسخة الاحتياطية: $BACKUP (احتفظ بها أو احذفها)."
