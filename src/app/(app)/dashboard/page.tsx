import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { balance, formatMoney } from "@/domain/money";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { TRANSPORT_LABELS } from "@/lib/labels";

export default async function Dashboard() {
  const user = await requirePage("dashboard.view");
  const money = can(user.role, "payments.view");
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
  const debts = money ? (await db.booking.findMany({
    where: { status: "ACTIVE", deletedAt: null, priceAmount: { not: null }, trip: { deletedAt: null, status: { not: "CANCELLED" } } },
    include: { pilgrim: true, trip: true, payments: true },
  })).map((b) => ({ b, bal: balance(b.priceAmount, b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))) ?? 0 })).filter((x) => x.bal > 0) : [];
  const totalDebt = debts.filter((x) => x.b.priceCurrency === "USD").reduce((n, x) => n + x.bal, 0);
  debts.sort((a, b) => b.bal - a.bal);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الرئيسية</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card text-center"><div className="text-xs text-gray-600">المعتمرون</div><div className="text-2xl font-bold">{pilgrims}</div></div>
        <div className="card text-center"><div className="text-xs text-gray-600">بلا صورة جواز</div><div className="text-2xl font-bold text-amber-700">{noPhoto}</div></div>
      </div>
      {money && (
        <div className="card overflow-x-auto p-0">
          <h2 className="p-3 font-bold">الأرصدة المستحقة — إجمالي {formatMoney(Math.round(totalDebt * 100) / 100, "USD")} على {debts.length} حجز</h2>
          <table className="w-full">
            <thead><tr><th className="th">المعتمر</th><th className="th">الرحلة</th><th className="th">المتبقي</th></tr></thead>
            <tbody>
              {debts.slice(0, 10).map(({ b, bal }) => (
                <tr key={b.id}><td className="td"><Link className="underline" href={`/bookings/${b.id}`}>{fullNameAr(b.pilgrim)}</Link></td><td className="td">{b.trip.tripNo}</td><td className="td font-bold text-red-700">{formatMoney(bal, b.priceCurrency)}</td></tr>
              ))}
              {debts.length === 0 && <tr><td className="td text-center text-gray-500" colSpan={3}>لا توجد أرصدة مستحقة</td></tr>}
            </tbody>
          </table>
        </div>
      )}
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
