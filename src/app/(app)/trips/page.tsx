import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { TripRowActions } from "@/components/TripRowActions";
import { TRIP_ORDER } from "@/server/trips";
import { dateOrNotSet } from "@/lib/tripLabel";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ archive?: string }> }) {
  const user = await requirePage("trips.view");
  const showArchive = (await searchParams).archive === "1";
  const trips = await db.trip.findMany({
    where: { deletedAt: null, archivedAt: showArchive ? { not: null } : null, ...(user.role === "SUPERVISOR" ? { supervisorId: user.id } : {}) },
    orderBy: TRIP_ORDER, // newest created first
    include: { _count: { select: { bookings: { where: { status: "ACTIVE", deletedAt: null } } } } },
  });
  const tw = can(user.role, "trips.write") || can(user.role, "trips.archive");
  const canArchive = can(user.role, "trips.archive"), canUnarchive = can(user.role, "trips.unarchive"), canWrite = can(user.role, "trips.write");
  const pay = tw ? await db.payment.groupBy({ by: ["bookingId"], where: { booking: { tripId: { in: trips.map((t) => t.id) } } }, _count: true }) : [];
  const payBookings = tw ? await db.booking.findMany({ where: { id: { in: pay.map((p) => p.bookingId) } }, select: { id: true, tripId: true } }) : [];
  const payCount = (tripId: string) => payBookings.filter((b) => b.tripId === tripId).reduce((n, b) => n + (pay.find((p) => p.bookingId === b.id)?._count ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{showArchive ? "الأرشيف" : "الرحلات"}</h1>
        <div className="flex gap-2">
          <Link href={showArchive ? "/trips" : "/trips?archive=1"} className="btn-secondary">{showArchive ? "رجوع للرحلات" : "الأرشيف"}</Link>
          {can(user.role, "trips.write") && !showArchive && <Link href="/trips/new" className="btn">+ رحلة جديدة</Link>}
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الرقم</th><th className="th">الاسم</th><th className="th">النوع</th><th className="th">الذهاب</th><th className="th">العودة</th><th className="th">المسجّلون / السعة</th><th className="th">الحالة</th>{tw && <th className="th">إجراءات</th>}</tr></thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} className="hover:bg-canvas">
                <td className="td font-bold"><Link className="text-brand underline" href={`/trips/${t.id}`}>{t.tripNo ?? "بدون رقم"}</Link></td>
                <td className="td">{t.name}</td><td className="td">{TRANSPORT_LABELS[t.transportType]}</td>
                <td className="td">{dateOrNotSet(t.departDate)}</td><td className="td">{dateOrNotSet(t.returnDate)}</td>
                <td className="td">{t._count.bookings} من {t.capacity}</td>
                <td className="td"><span className="chip chip-gray">{TRIP_STATUS_LABELS[t.status]}</span></td>
                {tw && <td className="td"><TripRowActions tripId={t.id} name={t.name} pilgrims={t._count.bookings} payments={payCount(t.id)} archived={showArchive} canWrite={canWrite && !showArchive} canArchive={canArchive} canUnarchive={canUnarchive} /></td>}
              </tr>
            ))}
            {trips.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={8}>لا توجد رحلات</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
