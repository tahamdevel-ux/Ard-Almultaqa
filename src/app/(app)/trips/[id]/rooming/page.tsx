import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip } from "@/server/trips";
import { fullNameAr } from "@/server/pilgrims";
import { stayDates, ROOM_TYPE_LABELS } from "@/domain/rooming";
import { formatDate } from "@/domain/dates";
import { RoomingBoard, type BoardRoom } from "@/components/RoomingBoard";
import { RoomingControls } from "@/components/RoomingControls";

const CITY_LABEL = { MAKKAH: "مكة المكرمة", MADINAH: "المدينة المنورة" } as const;

export default async function RoomingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ city?: string }> }) {
  const user = await requirePage("trips.view");
  const { id } = await params;
  const sp = await searchParams;
  const trip = await db.trip.findFirst({ where: { id, deletedAt: null }, include: { makkahHotel: true, madinahHotel: true } });
  if (!trip) notFound();
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const city = (sp.city === "MAKKAH" || sp.city === "MADINAH" ? sp.city : trip.firstCity) as "MAKKAH" | "MADINAH";
  const hotel = city === "MAKKAH" ? trip.makkahHotel : trip.madinahHotel;
  const stay = stayDates(trip.departDate, trip.firstCity, trip.nightsMakkah, trip.nightsMadinah).find((s) => s.city === city)!;

  const [rooms, bookings] = await Promise.all([
    db.room.findMany({ where: { tripId: id, city }, include: { assignments: { include: { booking: { include: { pilgrim: true, groups: { include: { group: true } } } } } } } }),
    db.booking.findMany({ where: { tripId: id, status: "ACTIVE", deletedAt: null }, include: { pilgrim: true, groups: { include: { group: true } }, rooms: { where: { city } } } }),
  ]);
  const person = (b: { id: string; pilgrim: (typeof bookings)[number]["pilgrim"]; groups: (typeof bookings)[number]["groups"] }) => ({
    bookingId: b.id, name: fullNameAr(b.pilgrim), gender: b.pilgrim.gender,
    group: b.groups[0] ? (b.groups[0].group.kind === "COMPANIONS" ? "عصبة" : "عائلة") : undefined,
  });
  const boardRooms: BoardRoom[] = rooms
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }))
    .map((r) => ({ id: r.id, roomNo: r.roomNo, beds: r.beds, typeLabel: ROOM_TYPE_LABELS[r.type], people: r.assignments.map((a) => person(a.booking)) }));
  const pool = bookings.filter((b) => b.rooms.length === 0).map(person);
  const totalBeds = rooms.reduce((n, r) => n + r.beds, 0);
  const emptyBeds = totalBeds - (bookings.length - pool.length);
  const w = can(user.role, "rooming.write");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">التسكين — {trip.tripNo} {trip.name}</h1>
        <Link href={`/trips/${id}`} className="btn-secondary">رجوع للرحلة</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["MADINAH", "MAKKAH"] as const).map((c) => (
          <Link key={c} href={`/trips/${id}/rooming?city=${c}`} className={c === city ? "btn" : "btn-secondary"}>{CITY_LABEL[c]}</Link>
        ))}
        {can(user.role, "outputs.view") && (
          <span className="flex flex-wrap gap-2">
            <a className="btn-secondary" href={`/api/trips/${id}/outputs/rooming-ar?city=${city}&format=pdf`}>قائمة التسكين (عربي) PDF</a>
            <a className="btn-secondary" href={`/api/trips/${id}/outputs/rooming-en?city=${city}&format=pdf`}>Rooming list (EN) PDF</a>
            <a className="btn-secondary" href={`/api/trips/${id}/outputs/rooming-en?city=${city}&format=xlsx`}>Excel</a>
          </span>
        )}
      </div>
      <p className="text-sm text-ink">
        الفندق: <b>{hotel ? (hotel.localName ? `${hotel.localName} (${hotel.officialName})` : hotel.officialName) : "غير محدد"}</b>
        {" · "}الدخول {formatDate(stay.checkIn)} ← الخروج {formatDate(stay.checkOut)}
      </p>
      {!hotel && <p className="alert-warn">⚠ حدّد فندق {CITY_LABEL[city]} من صفحة الرحلة قبل إضافة الغرف.</p>}
      {rooms.length > 0 && totalBeds < bookings.length && <p className="alert-bad">⚠ عدد الأسرّة ({totalBeds}) أقل من عدد المعتمرين ({bookings.length}).</p>}
      {rooms.length > 0 && emptyBeds > 0 && pool.length === 0 && <p className="alert-warn">ℹ {emptyBeds} سرير فارغ بعد تسكين الجميع.</p>}
      {w && <RoomingControls tripId={id} city={city} />}
      <p className="text-xs text-brand-mid">اللون: أبيض = فارغة · أصفر = جزئية · أخضر = ممتلئة. ♂ ♀ = الجنس.</p>
      <RoomingBoard key={city} tripId={id} city={city} rooms={boardRooms} pool={pool} canEdit={w} />
    </div>
  );
}
