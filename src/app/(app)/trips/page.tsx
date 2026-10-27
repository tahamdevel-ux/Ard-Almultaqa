import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { formatDate } from "@/domain/dates";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";

export default async function TripsPage() {
  const user = await requirePage("trips.view");
  const trips = await db.trip.findMany({
    where: { deletedAt: null, ...(user.role === "SUPERVISOR" ? { supervisorId: user.id } : {}) },
    orderBy: { departDate: "desc" },
    include: { _count: { select: { bookings: { where: { status: "ACTIVE", deletedAt: null } } } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الرحلات</h1>
        {can(user.role, "trips.write") && <Link href="/trips/new" className="btn">+ رحلة جديدة</Link>}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الرقم</th><th className="th">الاسم</th><th className="th">النوع</th><th className="th">الذهاب</th><th className="th">العودة</th><th className="th">المسجّلون / السعة</th><th className="th">الحالة</th></tr></thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="td font-bold"><Link className="text-brand underline" href={`/trips/${t.id}`}>{t.tripNo}</Link></td>
                <td className="td">{t.name}</td><td className="td">{TRANSPORT_LABELS[t.transportType]}</td>
                <td className="td">{formatDate(t.departDate)}</td><td className="td">{formatDate(t.returnDate)}</td>
                <td className="td">{t._count.bookings} / {t.capacity}</td>
                <td className="td"><span className="chip chip-gray">{TRIP_STATUS_LABELS[t.status]}</span></td>
              </tr>
            ))}
            {trips.length === 0 && <tr><td className="td text-center text-gray-500" colSpan={7}>لا توجد رحلات</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
