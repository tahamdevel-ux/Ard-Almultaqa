import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { TripRowActions } from "@/components/TripRowActions";
import { TRIP_ORDER } from "@/server/trips";
import { dateRangeLabel } from "@/lib/tripLabel";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";
import { Icon } from "@/components/icons";
import { Bar, EmptyState } from "@/components/charts";
import { seatsLabel } from "@/domain/labels";

const STATUS_CHIP = { OPEN: "chip-ok", FULL: "chip-warn", TRAVELLING: "chip-gray", RETURNED: "chip-gray", CANCELLED: "chip-bad" } as const;
type Sp = { archive?: string; type?: string; q?: string };

export default async function TripsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requirePage("trips.view");
  const sp = await searchParams;
  const showArchive = sp.archive === "1";
  const type = sp.type === "LAND" || sp.type === "AIR" ? sp.type : "";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const trips = await db.trip.findMany({
    where: {
      deletedAt: null, archivedAt: showArchive ? { not: null } : null, ...(user.role === "SUPERVISOR" ? { supervisorId: user.id } : {}),
      ...(type ? { transportType: type } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { tripNo: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: TRIP_ORDER, // newest created first
    include: { _count: { select: { bookings: { where: { status: "ACTIVE", deletedAt: null } } } } },
  });
  const tw = can(user.role, "trips.write") || can(user.role, "trips.archive");
  const canArchive = can(user.role, "trips.archive"), canUnarchive = can(user.role, "trips.unarchive"), canWrite = can(user.role, "trips.write");
  const pay = tw ? await db.payment.groupBy({ by: ["bookingId"], where: { booking: { tripId: { in: trips.map((t) => t.id) } } }, _count: true }) : [];
  const payBookings = tw ? await db.booking.findMany({ where: { id: { in: pay.map((p) => p.bookingId) } }, select: { id: true, tripId: true } }) : [];
  const payCount = (tripId: string) => payBookings.filter((b) => b.tripId === tripId).reduce((n, b) => n + (pay.find((p) => p.bookingId === b.id)?._count ?? 0), 0);
  const href = (o: Partial<Sp>) => { const u = new URLSearchParams(); const m = { archive: showArchive ? "1" : "", type, q, ...o }; for (const [k, v] of Object.entries(m)) if (v) u.set(k, v); return `/trips${u.toString() ? `?${u}` : ""}`; };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{showArchive ? "أرشيف الرحلات" : "الرحلات"} <span className="text-sm font-normal text-brand-mid">({trips.length})</span></h1>
        </div>
        <div className="flex gap-2">
          <Link href={showArchive ? "/trips" : "/trips?archive=1"} className="btn-secondary">{showArchive ? "← الرحلات" : "الأرشيف"}</Link>
          {canWrite && !showArchive && <Link href="/trips/new" className="btn"><Icon name="plus" size={16} />رحلة جديدة</Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex min-w-[14rem] flex-1 gap-2" action="/trips">
          {showArchive && <input type="hidden" name="archive" value="1" />}{type && <input type="hidden" name="type" value={type} />}
          <input name="q" defaultValue={q} placeholder="ابحث باسم الرحلة أو رقمها" aria-label="بحث في الرحلات" className="input" />
          <button className="btn-secondary">بحث</button>
        </form>
        <div className="flex gap-1.5 text-sm" role="group" aria-label="نوع الرحلة">
          {([["", "الكل"], ["LAND", "بري"], ["AIR", "جوي"]] as const).map(([v, l]) => (
            <Link key={v} href={href({ type: v })} aria-current={type === v ? "true" : undefined}
              className={"rounded-full border px-3.5 py-1.5 font-bold " + (type === v ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark hover:bg-canvas")}>{l}</Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="rt w-full">
          <thead><tr><th className="th">الرحلة</th><th className="th">التواريخ</th><th className="th w-56">التسجيل</th><th className="th">الحالة</th>{tw && <th className="th w-14"><span className="sr-only">إجراءات</span></th>}</tr></thead>
          <tbody>
            {trips.map((t) => {
              const n = t._count.bookings, seats = seatsLabel(n, t.capacity);
              return (
                <tr key={t.id} data-href={`/trips/${t.id}`} className="hover:bg-canvas">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-light text-brand" title={TRANSPORT_LABELS[t.transportType]}><Icon name={t.transportType === "AIR" ? "plane" : "bus"} size={20} /></span>
                      <div className="min-w-0">
                        <Link className="block font-bold text-ink hover:text-brand" href={`/trips/${t.id}`}>{t.name}</Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-brand-mid">
                          {t.tripNo ? <span className="chip chip-gray" dir="ltr">{t.tripNo}</span> : <span>بدون رقم</span>}
                          <span>{TRANSPORT_LABELS[t.transportType]}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="td text-sm">{t.departDate || t.returnDate ? dateRangeLabel(t.departDate, t.returnDate) : <span className="text-brand-mid">بدون تاريخ</span>}</td>
                  <td className="td">
                    {t.capacity > 0 ? <><div className="mb-1 text-sm font-bold">{n} <span className="font-normal text-brand-mid">من {t.capacity}</span></div><Bar value={n} max={t.capacity} tone={n > t.capacity ? "red" : "brand"} /></> : <span className={"chip " + (seats.tone === "warn" ? "chip-warn" : "chip-gray")}>{seats.text}</span>}
                  </td>
                  <td className="td"><span className={"chip " + STATUS_CHIP[t.status]}>{TRIP_STATUS_LABELS[t.status]}</span></td>
                  {tw && <td className="td text-end"><TripRowActions tripId={t.id} name={t.name} pilgrims={n} payments={payCount(t.id)} archived={showArchive} canWrite={canWrite && !showArchive} canArchive={canArchive} canUnarchive={canUnarchive} /></td>}
                </tr>
              );
            })}
            {trips.length === 0 && <tr><td colSpan={5}><EmptyState icon={<Icon name="inbox" size={36} />} text={showArchive ? "لا توجد رحلات مؤرشفة" : q || type ? "لا توجد رحلات بهذا البحث" : "لا توجد رحلات بعد — أنشئ أول رحلة"} /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
