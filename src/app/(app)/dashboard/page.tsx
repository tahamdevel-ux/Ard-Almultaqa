import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { balance, formatMoney } from "@/domain/money";
import { readiness } from "@/domain/readiness";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { TRANSPORT_LABELS, VISA_LABELS } from "@/lib/labels";
import { Bar, Donut, EmptyState, Legend, StatCard } from "@/components/charts";
import { Icon } from "@/components/icons";

export default async function Dashboard() {
  const user = await requirePage("dashboard.view");
  const money = can(user.role, "payments.view");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const trips = await db.trip.findMany({
    where: { deletedAt: null, status: { in: ["OPEN", "FULL", "TRAVELLING"] }, returnDate: { gte: today } },
    orderBy: { departDate: "asc" }, take: 8,
    include: { bookings: { where: { status: "ACTIVE", deletedAt: null }, include: { pilgrim: { include: { documents: { select: { type: true } } } } } } },
  });
  const pilgrims = await db.pilgrim.count({ where: { deletedAt: null } });

  const rows = trips.flatMap((t) => t.bookings.map((b) => ({ b, ...readiness({ bookingActive: true, docs: b.pilgrim.documents.map((d) => d.type), visaStatus: b.visaStatus }) })));
  const ready = rows.filter((r) => r.ready).length;
  const missingDocs = rows.filter((r) => r.missing.some((m) => m.startsWith("ناقص"))).length;
  const visa = { ISSUED: 0, IN_PROGRESS: 0, NOT_SUBMITTED: 0, REJECTED: 0 };
  for (const r of rows) visa[r.b.visaStatus]++;
  const visaSegs = [
    { label: VISA_LABELS.ISSUED, value: visa.ISSUED, color: "#2f7d4f" },
    { label: VISA_LABELS.IN_PROGRESS, value: visa.IN_PROGRESS, color: "#e3b02e" },
    { label: VISA_LABELS.NOT_SUBMITTED, value: visa.NOT_SUBMITTED, color: "#a8ac98" },
    { label: VISA_LABELS.REJECTED, value: visa.REJECTED, color: "#b42318" },
  ];

  const debts = money ? (await db.booking.findMany({
    where: { status: "ACTIVE", deletedAt: null, priceAmount: { not: null }, trip: { deletedAt: null, status: { not: "CANCELLED" } } },
    include: { pilgrim: true, trip: true, payments: true },
  })).map((b) => ({ b, bal: balance(b.priceAmount, b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))) ?? 0 })).filter((x) => x.bal > 0) : [];
  const totalDebt = debts.filter((x) => x.b.priceCurrency === "USD").reduce((n, x) => n + x.bal, 0);
  debts.sort((a, b) => b.bal - a.bal);

  return (
    <div className="space-y-5">
      <div><h1 className="page-title">مرحباً {user.name}</h1><p className="text-sm text-brand-mid">ملخص الرحلات القادمة وحالة المعتمرين</p></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي المعتمرين" value={String(pilgrims)} icon={<Icon name="users" size={22} />} />
        <StatCard label="رحلات قادمة" value={String(trips.length)} icon={<Icon name="bus" size={22} />} tone="gold" />
        <StatCard label="جاهزون للسفر" value={`${ready} من ${rows.length}`} icon={<Icon name="check" size={22} />} tone="green" />
        {money
          ? <StatCard label="أرصدة مستحقة" value={formatMoney(Math.round(totalDebt), "USD")} icon={<Icon name="wallet" size={22} />} tone="red"><div className="text-xs text-brand-mid">{debts.length} حجز</div></StatCard>
          : <StatCard label="مستمسكات ناقصة" value={String(missingDocs)} icon={<Icon name="alert" size={22} />} tone="red" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="section-title"><Icon name="bus" size={18} />الرحلات القادمة ونسبة الامتلاء</h2>
          {trips.length === 0 ? <EmptyState icon={<Icon name="inbox" size={36} />} text="لا توجد رحلات قادمة" /> : (
            <ul className="space-y-4">
              {trips.map((t) => {
                const n = t.bookings.length;
                const noVisa = t.bookings.filter((b) => b.visaStatus !== "ISSUED").length;
                const noDocs = t.bookings.filter((b) => !["PASSPORT", "PHOTO"].every((x) => b.pilgrim.documents.some((d) => d.type === x))).length;
                return (
                  <li key={t.id}>
                    <div className="mb-1 flex flex-wrap items-center gap-x-3 text-sm">
                      <Link className="font-bold text-brand underline-offset-2 hover:underline" href={`/trips/${t.id}`}>{t.tripNo} — {t.name}</Link>
                      <span className="chip chip-gray"><Icon name={t.transportType === "AIR" ? "plane" : "bus"} size={13} className="ml-1" />{TRANSPORT_LABELS[t.transportType]}</span>
                      <span className="text-xs text-brand-mid">{formatDate(t.departDate)}</span>
                      <span className="mr-auto text-xs text-brand-mid">{n} من {t.capacity}</span>
                    </div>
                    <Bar value={n} max={t.capacity} tone={t.capacity && n > t.capacity ? "red" : "brand"} />
                    <div className="mt-1 flex gap-3 text-xs text-brand-mid"><span>تأشيرات لم تصدر: <b className={noVisa ? "text-gold-dark" : ""}>{noVisa}</b></span><span>مستمسكات ناقصة: <b className={noDocs ? "text-red-700" : ""}>{noDocs}</b></span></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="section-title"><Icon name="doc" size={18} />حالة التأشيرات</h2>
          {rows.length === 0 ? <EmptyState icon={<Icon name="inbox" size={36} />} text="لا توجد حجوزات" /> : (
            <div className="flex flex-col items-center gap-4">
              <Donut segments={visaSegs} center={{ big: `${rows.length ? Math.round((visa.ISSUED / rows.length) * 100) : 0}%`, small: "صدرت" }} />
              <div className="w-full"><Legend segments={visaSegs} /></div>
            </div>
          )}
        </section>
      </div>

      {money && (
        <section className="card overflow-x-auto p-0">
          <h2 className="section-title p-4 pb-2"><Icon name="wallet" size={18} />أعلى الأرصدة المستحقة</h2>
          <table className="w-full">
            <thead><tr><th className="th">المعتمر</th><th className="th">الرحلة</th><th className="th">المتبقي</th></tr></thead>
            <tbody>
              {debts.slice(0, 8).map(({ b, bal }) => (
                <tr key={b.id}><td className="td"><Link className="font-bold text-brand hover:underline" href={`/bookings/${b.id}`}>{fullNameAr(b.pilgrim)}</Link></td><td className="td">{b.trip.tripNo}</td><td className="td font-bold text-red-700">{formatMoney(bal, b.priceCurrency)}</td></tr>
              ))}
              {debts.length === 0 && <tr><td colSpan={3}><EmptyState icon={<Icon name="check" size={36} />} text="لا توجد أرصدة مستحقة" /></td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
