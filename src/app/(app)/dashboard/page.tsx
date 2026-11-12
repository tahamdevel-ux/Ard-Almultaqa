import Link from "next/link";
import { db } from "@/server/db";
import { TRIP_ORDER } from "@/server/trips";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { balance, formatMoney } from "@/domain/money";
import { readiness } from "@/domain/readiness";
import { fullNameAr } from "@/server/pilgrims";
import { tripLabel } from "@/lib/tripLabel";
import { TRANSPORT_LABELS } from "@/lib/labels";
import { attentionCounts } from "@/server/attention";
import { formatDate } from "@/domain/dates";
import { Bar, Donut, EmptyState, Legend, StatCard } from "@/components/charts";
import { Icon } from "@/components/icons";

export default async function Dashboard() {
  const user = await requirePage("dashboard.view");
  const money = can(user.role, "payments.view");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const trips = await db.trip.findMany({
    where: { deletedAt: null, archivedAt: null, status: { in: ["OPEN", "FULL", "TRAVELLING"] }, OR: [{ returnDate: { gte: today } }, { returnDate: null }] }, // undated trips stay listed
    orderBy: TRIP_ORDER, take: 8,
    include: { bookings: { where: { status: "ACTIVE", deletedAt: null }, include: { pilgrim: true } } },
  });
  const pilgrims = await db.pilgrim.count({ where: { deletedAt: null } });
  const rooms = can(user.role, "officeRooms.view");
  const att = await attentionCounts({ rooms, money });

  const rows = trips.flatMap((t) => t.bookings.map((b) => ({ b, ...readiness({ bookingActive: true, passportNo: b.pilgrim.passportNo }) })));
  const ready = rows.filter((r) => r.ready).length;

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
          : <StatCard label="شواغر الرحلات" value={String(trips.reduce((n, t) => n + Math.max(0, t.capacity - t.bookings.length), 0))} icon={<Icon name="alert" size={22} />} tone="red" />}
      </div>

      {(() => {
        const items: { label: string; n: number | null; href: string; tone: "bad" | "warn" }[] = [
          { label: "جوازات تنتهي قريباً", n: att.expiring, href: "/pilgrims?f=expiring", tone: "bad" },
          ...(rooms ? [{ label: "معتمرون بلا غرفة", n: att.noRoom, href: "/pilgrims?f=noroom", tone: "warn" as const }] : []),
          ...(money ? [{ label: "حجوزات بلا سعر", n: att.noPrice, href: "/pilgrims?f=noprice", tone: "warn" as const }] : []),
          { label: "رحلات تجاوزت السعة", n: att.overCapacity, href: "/trips", tone: "bad" },
        ];
        const open = items.filter((i) => (i.n ?? 0) > 0);
        return (
          <section className="card" aria-label="يحتاج انتباهك">
            <h2 className="section-title"><Icon name="alert" size={18} />يحتاج انتباهك</h2>
            {open.length === 0 ? <p className="flex items-center gap-2 text-sm font-bold text-green-800"><Icon name="check" size={18} />لا شيء يحتاج انتباهاً الآن</p> : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {open.map((i) => (
                  <li key={i.label}><Link href={i.href} className={"flex items-center justify-between rounded-lg border px-3 py-2 font-bold hover:shadow-sm " + (i.tone === "bad" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
                    <span className="text-sm">{i.label}</span><span className="text-xl">{i.n}</span></Link></li>
                ))}
              </ul>
            )}
          </section>
        );
      })()}

      <div className="grid gap-4">
        <section className="card">
          <h2 className="section-title"><Icon name="bus" size={18} />الرحلات القادمة ونسبة الامتلاء</h2>
          {trips.length === 0 ? <EmptyState icon={<Icon name="inbox" size={36} />} text="لا توجد رحلات قادمة" /> : (
            <ul className="space-y-4">
              {trips.map((t) => {
                const n = t.bookings.length;
                return (
                  <li key={t.id} data-href={`/trips/${t.id}`} className="rounded-lg p-1.5 hover:bg-canvas">
                    <div className="mb-1 flex flex-wrap items-center gap-x-3 text-sm">
                      <Link className="font-bold text-brand underline-offset-2 hover:underline" href={`/trips/${t.id}`}>{tripLabel(t)}</Link>
                      <span className="chip chip-gray"><Icon name={t.transportType === "AIR" ? "plane" : "bus"} size={13} className="ml-1" />{TRANSPORT_LABELS[t.transportType]}</span>
                      <span className="text-xs text-brand-mid">{t.departDate ? formatDate(t.departDate) : "بدون تاريخ"}</span>
                      <span className="mr-auto text-xs text-brand-mid">{n} من {t.capacity}</span>
                    </div>
                    <Bar value={n} max={t.capacity} tone={t.capacity && n > t.capacity ? "red" : "brand"} />
                  </li>
                );
              })}
            </ul>
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
                <tr key={b.id} data-href={`/bookings/${b.id}`}><td className="td"><Link className="font-bold text-brand hover:underline" href={`/bookings/${b.id}`}>{fullNameAr(b.pilgrim)}</Link></td><td className="td">{b.trip.tripNo ?? b.trip.name}</td><td className="td font-bold text-red-700">{formatMoney(bal, b.priceCurrency)}</td></tr>
              ))}
              {debts.length === 0 && <tr><td colSpan={3}><EmptyState icon={<Icon name="check" size={36} />} text="لا توجد أرصدة مستحقة" /></td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
