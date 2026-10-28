import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip } from "@/server/trips";
import { fullNameAr } from "@/server/pilgrims";
import { nonAdjacentGroups, SEATS_PER_ROW } from "@/domain/seating";
import { assignSeat, autoSeatBus, clearSeat } from "../../../actions";

export default async function BusPage({ params }: { params: Promise<{ id: string; busId: string }> }) {
  const user = await requirePage("trips.view");
  const { id, busId } = await params;
  const bus = await db.bus.findFirst({ where: { id: busId, tripId: id }, include: { trip: true } });
  if (!bus) notFound();
  if (!canSeeTrip(user, bus.trip)) redirect("/forbidden");
  const bookings = await db.booking.findMany({
    where: { tripId: id, status: "ACTIVE", deletedAt: null },
    include: { pilgrim: true, seat: true, groups: true },
    orderBy: { createdAt: "asc" },
  });
  const onBus = new Map<number, (typeof bookings)[number]>();
  for (const b of bookings) if (b.seat?.busId === busId && b.seat.seatNo) onBus.set(b.seat.seatNo, b);
  const unseated = bookings.filter((b) => !b.seat);
  const sw = can(user.role, "seats.write");
  const seatMap = new Map([...onBus].map(([n, b]) => [b.id, n]));
  const groupMap = new Map<string, string[]>();
  for (const b of bookings) for (const g of b.groups) groupMap.set(g.groupId, [...(groupMap.get(g.groupId) ?? []), b.id]);
  const bad = nonAdjacentGroups(seatMap, [...groupMap].map(([gid, ids]) => ({ id: gid, bookingIds: ids })));

  const rows = Math.ceil(bus.seatCount / SEATS_PER_ROW);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">باص {bus.number} — خريطة المقاعد</h1>
        <div className="flex gap-2">
          <Link href={`/trips/${id}`} className="btn-secondary">رجوع للرحلة</Link>
          {sw && <form action={autoSeatBus.bind(null, id, busId)}><button className="btn">توزيع تلقائي (العوائل متجاورة)</button></form>}
        </div>
      </div>
      {bad.length > 0 && <p className="alert-warn">⚠ {bad.length} مجموعة غير متجاورة في المقاعد</p>}
      <p className="text-sm text-brand-mid">{onBus.size} / {bus.seatCount} مقعد مشغول · بدون مقعد: {unseated.length}</p>
      <div className="card space-y-1">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-stretch gap-1">
            <span className="w-6 pt-2 text-xs text-gray-400">{r + 1}</span>
            {Array.from({ length: SEATS_PER_ROW }, (_, c) => {
              const n = r * SEATS_PER_ROW + c + 1;
              if (n > bus.seatCount) return null;
              const b = onBus.get(n);
              return (
                <div key={n} className={"flex-1 rounded border p-1 text-xs " + (c === 1 ? "ml-4 " : "") + (b ? "border-brand bg-brand-light" : "border-line bg-white")}>
                  <div className="font-bold">{n}</div>
                  {b ? (
                    <>
                      <div className="truncate">{fullNameAr(b.pilgrim)}</div>
                      {sw && <form action={clearSeat.bind(null, id, b.id)}><button className="text-red-700 underline">إخلاء</button></form>}
                    </>
                  ) : sw && unseated.length > 0 ? (
                    <form action={assignSeat.bind(null, id, busId, n)}>
                      <select name="bookingId" className="w-full rounded border text-xs" defaultValue="" aria-label={`مقعد ${n}`}>
                        <option value="" />{unseated.map((u) => <option key={u.id} value={u.id}>{fullNameAr(u.pilgrim)}</option>)}
                      </select>
                      <button className="mt-0.5 w-full rounded bg-brand text-white">تعيين</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
