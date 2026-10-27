import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { formatDate } from "@/domain/dates";
import { TRANSPORT_LABELS } from "@/lib/labels";

export default async function Dashboard() {
  await requirePage("dashboard.view");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const trips = await db.trip.findMany({
    where: { deletedAt: null, status: { in: ["OPEN", "FULL", "TRAVELLING"] }, returnDate: { gte: today } },
    orderBy: { departDate: "asc" }, take: 10,
    include: { bookings: { where: { status: "ACTIVE", deletedAt: null }, include: { pilgrim: { include: { documents: { select: { type: true } } } } } } },
  });
  const [pilgrims, noPhoto] = await Promise.all([
    db.pilgrim.count({ where: { deletedAt: null } }),
    db.pilgrim.count({ where: { deletedAt: null, documents: { none: { type: "PASSPORT" } } } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الرئيسية</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card text-center"><div className="text-xs text-gray-600">المعتمرون</div><div className="text-2xl font-bold">{pilgrims}</div></div>
        <div className="card text-center"><div className="text-xs text-gray-600">بلا صورة جواز</div><div className="text-2xl font-bold text-amber-700">{noPhoto}</div></div>
      </div>
      <div className="card overflow-x-auto p-0">
        <h2 className="p-3 font-bold">الرحلات القادمة</h2>
        <table className="w-full">
          <thead><tr><th className="th">الرحلة</th><th className="th">النوع</th><th className="th">الذهاب</th><th className="th">نسبة الامتلاء</th><th className="th">تأشيرات لم تصدر</th><th className="th">مستمسكات ناقصة</th></tr></thead>
          <tbody>
            {trips.map((t) => {
              const n = t.bookings.length;
              const noVisa = t.bookings.filter((b) => b.visaStatus !== "ISSUED").length;
              const noDocs = t.bookings.filter((b) => !["PASSPORT", "PHOTO"].every((x) => b.pilgrim.documents.some((d) => d.type === x))).length;
              return (
                <tr key={t.id}>
                  <td className="td"><Link className="font-bold text-brand underline" href={`/trips/${t.id}`}>{t.tripNo} {t.name}</Link></td>
                  <td className="td">{TRANSPORT_LABELS[t.transportType]}</td><td className="td">{formatDate(t.departDate)}</td>
                  <td className="td">{n} / {t.capacity} ({t.capacity ? Math.round((n / t.capacity) * 100) : 0}%)</td>
                  <td className="td">{noVisa}</td><td className="td">{noDocs}</td>
                </tr>
              );
            })}
            {trips.length === 0 && <tr><td className="td text-center text-gray-500" colSpan={6}>لا توجد رحلات قادمة</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
