import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip } from "@/server/trips";
import { tripleNameAr } from "@/server/pilgrims";
import { tripLabel } from "@/lib/tripLabel";
import { memberWarning, printOrder, roomLabel, roomSummary, type OfficeRoomState } from "@/domain/officeRooms";
import { ROOM_TYPE_LABELS, type RoomTypeKey } from "@/domain/rooming";
import { loadOfficeState } from "@/officeRooms/service";
import { OfficeBoard, type BoardCard, type BoardPerson } from "@/components/OfficeBoard";

export default async function OfficeRoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("officeRooms.view");
  const { id } = await params;
  const trip = await db.trip.findFirst({ where: { id, deletedAt: null } });
  if (!trip) notFound();
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const state = await loadOfficeState(db, id);
  const names = new Map(state.bookings.map((b) => [b.id, b] as const));
  const pilgrims = await db.pilgrim.findMany({ where: { id: { in: state.bookings.map((b) => b.pilgrimId) } } });
  const nameOf = new Map(pilgrims.map((p) => [p.id, tripleNameAr(p)]));
  const person = (bookingId: string, gender: "MALE" | "FEMALE", group?: string): BoardPerson => ({
    bookingId, gender, name: nameOf.get(names.get(bookingId)!.pilgrimId) ?? "", locked: false, group, head: !!names.get(bookingId)?.groups.some((g) => g.isHead && g.group.kind === "FAMILY"),
  });
  const hotelNames = new Map((await db.tripHotel.findMany({ where: { tripId: id }, include: { hotel: true } })).map((h) => [h.id, h.hotel.localName ?? h.hotel.officialName]));
  const roomNos = new Map((await db.officeRoom.findMany({ where: { tripId: id }, select: { id: true, makkahHotelRoomNo: true, madinahHotelRoomNo: true } })).map((r) => [r.id, r]));
  const agentNames = new Map((await db.agent.findMany({ select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  const groupLabel = (bookingId: string) => { const g = names.get(bookingId)?.groups[0]; return g ? (g.group.kind === "FAMILY" ? "عائلة" : "عصبة") : undefined; };
  const ordered = printOrder(state.rooms);
  const cards: BoardCard[] = ordered.map((r: OfficeRoomState) => ({
    id: r.id, label: roomLabel(r), typeLabel: r.roomType ? ROOM_TYPE_LABELS[r.roomType as RoomTypeKey] : `${r.capacity} (افتراضي)`, category: r.category, capacity: r.capacity, locked: r.locked,
    hotel: r.hotelId ? hotelNames.get(r.hotelId) : undefined, makkahNo: roomNos.get(r.id)?.makkahHotelRoomNo ?? "", madinahNo: roomNos.get(r.id)?.madinahHotelRoomNo ?? "",
    people: r.members.map((m) => ({ ...person(m.bookingId, m.gender, groupLabel(m.bookingId)), agent: m.agentId ? agentNames.get(m.agentId) : undefined, noHousing: m.noHousing, manual: m.assignedBy === "MANUAL", warning: memberWarning(r, m, state.ctx.agentCodes) })),
  }));
  const housed = new Set(state.rooms.flatMap((r) => r.members.map((m) => m.bookingId)));
  const pool = state.bookings.filter((b) => !housed.has(b.id)).map((b) => person(b.id, b.pilgrim.gender, groupLabel(b.id)));
  const sum = roomSummary(state.rooms, state.ctx.agentCodes);
  const w = can(user.role, "officeRooms.write");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">غرف المكتب — {tripLabel(trip)}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/trips/${id}`} className="btn-secondary">رجوع للرحلة</Link>
          <a className="btn" href={`/api/trips/${id}/office-rooms/print`}>طباعة التسكين الداخلي</a>
        </div>
      </div>
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">داخلي للمكتب · لا يُسلَّم لأي جهة — أرقام الغرف هنا لا تظهر في أي مستند آخر.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["الغرف", sum.rooms], ["المعتمرون", sum.pilgrims], ["أسرّة فارغة", sum.emptyBeds], ["تنبيهات", sum.warnings]].map(([l, v]) => (
          <div key={l as string} className="card text-center"><div className="text-xs text-brand-mid">{l}</div><div className={"text-xl font-bold " + (l === "تنبيهات" && Number(v) > 0 ? "text-red-700" : "")}>{v}</div></div>
        ))}
      </div>
      <OfficeBoard tripId={id} cards={cards} pool={pool} canEdit={w} isAdmin={can(user.role, "officeRooms.renumber")} />
    </div>
  );
}
