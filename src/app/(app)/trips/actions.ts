"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { AuthError, requirePermission, type SessionUser } from "@/server/auth";
import { normalizePassportNo } from "@/domain/passport";
import { autoSeat, validateSeat } from "@/domain/seating";
import { overlapWarning } from "@/server/trips";
import { addPilgrimToTrips, overlapWarnings } from "@/server/bookings";
import { moveBookingsToBus } from "@/server/buses";
import { getSetting } from "@/server/settings";
import { parseDate } from "@/domain/dates";
import { parseTripIdentity } from "@/domain/tripFields";
import { auditChanges } from "@/server/audit";

export type TripActionState = { error?: string; warning?: string; ok?: boolean };

async function guarded(perm: Parameters<typeof requirePermission>[0], fn: (u: SessionUser) => Promise<TripActionState>): Promise<TripActionState> {
  try { return await fn(await requirePermission(perm)); } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const touch = (tripId: string) => revalidatePath(`/trips/${tripId}`, "layout");

export async function addBus(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("trips.write", async () => {
    // the number is optional: an empty one becomes the next free number
    const existing = await db.bus.findMany({ where: { tripId }, select: { number: true } });
    const next = String(Math.max(0, ...existing.map((x) => (/^\d+$/.test(x.number) ? +x.number : 0))) + 1);
    const number = s(f, "number") || next;
    if (existing.some((x) => x.number === number)) return { error: "رقم الباص مستخدم في هذه الرحلة" };
    await db.bus.create({ data: { tripId, number, name: s(f, "name") || null, driverName: s(f, "driverName") || null, driverPhone: s(f, "driverPhone") || null, company: s(f, "company") || null, seatCount: +s(f, "seatCount") || 48 } });
    touch(tripId); return { ok: true };
  });
}

/** A bus can only be deleted when nobody sits on it; the user moves the pilgrims first. */
export async function deleteBus(tripId: string, busId: string): Promise<TripActionState> {
  return guarded("trips.write", async () => {
    const bus = await db.bus.findFirst({ where: { id: busId, tripId } });
    if (!bus) return { error: "الباص غير موجود" };
    if (await db.seatAssignment.count({ where: { busId } })) return { error: "انقل المعتمرين أولاً" };
    await db.bus.delete({ where: { id: busId } });
    touch(tripId); return { ok: true };
  });
}

/** Moves one or more pilgrims (their family/companion groups together) to another bus. */
export async function moveToBus(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("seats.write", async () => {
    const targetBusId = s(f, "targetBusId");
    const ids = f.getAll("bookingIds").map(String);
    if (!targetBusId) return { error: "اختر الباص الهدف" };
    const r = await moveBookingsToBus(tripId, targetBusId, ids);
    if (!r.ok) return { error: r.error };
    touch(tripId); return { ok: true, warning: undefined };
  });
}

export async function addFlight(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("trips.write", async () => {
    if (!s(f, "flightNo")) return { error: "رقم الرحلة الجوية مطلوب" };
    const dt = (k: string) => (s(f, k) ? new Date(s(f, k) + "+03:00") : null);
    await db.flight.create({ data: { tripId, flightNo: s(f, "flightNo"), airline: s(f, "airline") || null, departAt: dt("departAt"), arriveAt: dt("arriveAt"), ticketCount: +s(f, "ticketCount") || 0 } });
    touch(tripId); return { ok: true };
  });
}
export async function addCar(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("trips.write", async () => {
    if (!s(f, "label")) return { error: "اسم/رقم السيارة مطلوب" };
    await db.groundCar.create({ data: { tripId, label: s(f, "label"), driverName: s(f, "driverName") || null, driverPhone: s(f, "driverPhone") || null, capacity: +s(f, "capacity") || 4 } });
    touch(tripId); return { ok: true };
  });
}

export async function removeBooking(tripId: string, bookingId: string) {
  await requirePermission("bookings.write");
  if (await db.payment.count({ where: { bookingId } })) return; // has money: cancel from the account page (reason + refund)
  await db.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "إزالة من الرحلة" } });
  await db.seatAssignment.deleteMany({ where: { bookingId } });
  touch(tripId);
}

export async function setVisa(tripId: string, bookingId: string, f: FormData) {
  await requirePermission("bookings.write");
  const st = s(f, "visaStatus");
  if (!["NOT_SUBMITTED", "IN_PROGRESS", "ISSUED", "REJECTED"].includes(st)) return;
  const issue = s(f, "visaIssue") ? parseDate(s(f, "visaIssue")) : null;
  const expiry = s(f, "visaExpiry") ? parseDate(s(f, "visaExpiry")) : null;
  await db.booking.update({ where: { id: bookingId }, data: { visaStatus: st as never, visaNo: s(f, "visaNo") || null, visaIssue: issue, visaExpiry: expiry } });
  touch(tripId);
}

export async function assignSeat(tripId: string, busId: string, seatNo: number, f: FormData): Promise<void> {
  await requirePermission("seats.write");
  const bookingId = s(f, "bookingId");
  if (!bookingId) return;
  const bus = await db.bus.findFirstOrThrow({ where: { id: busId, tripId } });
  const taken = await db.seatAssignment.findMany({ where: { busId }, select: { seatNo: true, bookingId: true } });
  const occ = new Map(taken.filter((t) => t.seatNo != null).map((t) => [t.seatNo!, t.bookingId]));
  if (validateSeat(seatNo, bus.seatCount, occ, bookingId)) return;
  const b = await db.booking.findFirst({ where: { id: bookingId, tripId, status: "ACTIVE" } });
  if (!b) return;
  await db.seatAssignment.upsert({ where: { bookingId }, create: { bookingId, busId, seatNo }, update: { busId, seatNo, ticketNo: null, carId: null } });
  touch(tripId);
}
export async function clearSeat(tripId: string, bookingId: string) {
  await requirePermission("seats.write");
  await db.seatAssignment.deleteMany({ where: { bookingId } });
  touch(tripId);
}

export async function autoSeatBus(tripId: string, busId: string) {
  await requirePermission("seats.write");
  const bus = await db.bus.findFirstOrThrow({ where: { id: busId, tripId } });
  const taken = await db.seatAssignment.findMany({ where: { busId } });
  const occ = new Map(taken.filter((t) => t.seatNo != null).map((t) => [t.seatNo!, t.bookingId]));
  const unseated = await db.booking.findMany({
    where: { tripId, status: "ACTIVE", deletedAt: null, seat: null },
    include: { groups: true, pilgrim: true }, orderBy: { createdAt: "asc" },
  });
  const plan = autoSeat(bus.seatCount, occ, unseated.map((b) => ({ bookingId: b.id, groupId: b.groups[0]?.groupId ?? b.pilgrim.familyGroupId })));
  for (const [bookingId, seatNo] of plan) await db.seatAssignment.create({ data: { bookingId, busId, seatNo } });
  touch(tripId);
}

export async function setAirAssignment(tripId: string, bookingId: string, f: FormData) {
  await requirePermission("seats.write");
  const ticketNo = s(f, "ticketNo") || null, carId = s(f, "carId") || null;
  await db.seatAssignment.upsert({ where: { bookingId }, create: { bookingId, ticketNo, carId }, update: { ticketNo, carId, busId: null, seatNo: null } });
  touch(tripId);
}

export async function createCompanionGroup(tripId: string, f: FormData) {
  await requirePermission("bookings.write");
  const ids = f.getAll("bookingIds").map(String);
  const max = await getSetting("maxCompanionGroup");
  if (ids.length < 2 || ids.length > max) return;
  const bookings = await db.booking.findMany({ where: { id: { in: ids }, tripId, status: "ACTIVE" } });
  if (bookings.length !== ids.length) return;
  const kind = s(f, "kind") === "FAMILY" ? "FAMILY" : "COMPANIONS";
  const g = await db.familyGroup.create({ data: { kind, label: s(f, "label") || null } });
  await db.bookingGroupMember.deleteMany({ where: { bookingId: { in: ids } } });
  await db.bookingGroupMember.createMany({ data: ids.map((bookingId) => ({ bookingId, groupId: g.id })) });
  touch(tripId);
}
export async function dissolveGroup(tripId: string, groupId: string) {
  await requirePermission("bookings.write");
  await db.familyGroup.delete({ where: { id: groupId } });
  touch(tripId);
}

export async function setTripHotels(tripId: string, f: FormData) {
  await requirePermission("trips.write");
  await db.trip.update({ where: { id: tripId }, data: {
    makkahHotelId: s(f, "makkahHotelId") || null, madinahHotelId: s(f, "madinahHotelId") || null,
    firstCity: s(f, "firstCity") === "MAKKAH" ? "MAKKAH" : "MADINAH",
    nightsMakkah: +s(f, "nightsMakkah") || 0, nightsMadinah: +s(f, "nightsMadinah") || 0,
  } });
  touch(tripId);
}

export async function saveAsProgram(tripId: string) {
  await requirePermission("programs.write");
  const t = await db.trip.findFirstOrThrow({ where: { id: tripId }, include: { buses: true } });
  // duration only when both dates are known; otherwise keep the template default (10 days)
  const days = t.departDate && t.returnDate ? Math.round((t.returnDate.getTime() - t.departDate.getTime()) / 86400000) : undefined;
  await db.program.create({ data: {
    name: t.name, transportType: t.transportType, nightsMakkah: t.nightsMakkah, nightsMadinah: t.nightsMadinah, firstCity: t.firstCity,
    makkahHotelId: t.makkahHotelId, madinahHotelId: t.madinahHotelId, capacity: t.capacity,
    busCount: t.buses.length, seatsPerBus: t.buses[0]?.seatCount ?? 48, ...(days != null ? { durationDays: days } : {}),
  } });
  revalidatePath("/programs");
}

/** Edits only the three optional identity fields of a trip: code, departure date, return date. Empty values are stored as NULL and every change is audited. */
export async function updateTripBasics(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("trips.write", async (u) => {
    const id = parseTripIdentity({ tripNo: s(f, "tripNo"), departDate: s(f, "departDate"), returnDate: s(f, "returnDate") });
    if (!id.ok) return { error: id.error };
    if (id.tripNo && (await db.trip.findFirst({ where: { tripNo: id.tripNo, NOT: { id: tripId } } }))) return { error: "رقم الرحلة مستخدم" };
    try {
      await db.$transaction(async (tx) => {
        const before = await tx.trip.findUniqueOrThrow({ where: { id: tripId } });
        const after = await tx.trip.update({ where: { id: tripId }, data: { tripNo: id.tripNo, departDate: id.departDate, returnDate: id.returnDate } });
        await auditChanges(tx, u, "Trip", tripId, before, after, ["tripNo", "departDate", "returnDate"]);
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return { error: "رقم الرحلة مستخدم" };
      throw e;
    }
    touch(tripId);
    revalidatePath("/trips");
    return { ok: true };
  });
}

/** Popup on the trip page: add an existing pilgrim to THIS trip only. */
export async function addExistingPilgrim(tripId: string, pilgrimId: string): Promise<TripActionState> {
  return guarded("bookings.write", async () => {
    const pilgrim = await db.pilgrim.findFirst({ where: { id: pilgrimId, deletedAt: null } });
    if (!pilgrim) return { error: "المعتمر غير موجود" };
    const r = await db.$transaction((tx) => addPilgrimToTrips(tx, pilgrimId, pilgrim.agentId, [tripId]));
    if (r.missing.length) return { error: "الرحلة غير موجودة" };
    if (r.skipped.length) return { error: "المعتمر مضاف مسبقاً لهذه الرحلة" };
    const warnings = await overlapWarnings(pilgrimId, [tripId]);
    touch(tripId);
    return { ok: true, warning: warnings[0]?.replace(/^[^:]*: /, "") };
  });
}

const TRIP_AUDITED = ["tripNo", "name", "departDate", "returnDate", "capacity", "supervisorId", "status", "nightsMakkah", "nightsMadinah"] as const;

/** Full edit of a trip (from the trips list). The transport type is fixed once the trip exists. */
export async function updateTrip(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("trips.write", async (u) => {
    const id = parseTripIdentity({ tripNo: s(f, "tripNo"), departDate: s(f, "departDate"), returnDate: s(f, "returnDate") });
    if (!id.ok) return { error: id.error };
    if (!s(f, "name")) return { error: "اسم الرحلة مطلوب" };
    if (id.tripNo && (await db.trip.findFirst({ where: { tripNo: id.tripNo, NOT: { id: tripId } } }))) return { error: "رقم الرحلة مستخدم" };
    const status = ["OPEN", "FULL", "TRAVELLING", "RETURNED", "CANCELLED"].includes(s(f, "status")) ? (s(f, "status") as "OPEN") : "OPEN";
    try {
      await db.$transaction(async (tx) => {
        const before = await tx.trip.findUniqueOrThrow({ where: { id: tripId } });
        const after = await tx.trip.update({ where: { id: tripId }, data: {
          tripNo: id.tripNo, name: s(f, "name"), departDate: id.departDate, returnDate: id.returnDate,
          capacity: Math.max(0, +s(f, "capacity") || 0), supervisorId: s(f, "supervisorId") || null, status,
          nightsMakkah: Math.max(0, +s(f, "nightsMakkah") || 0), nightsMadinah: Math.max(0, +s(f, "nightsMadinah") || 0),
        } });
        await auditChanges(tx, u, "Trip", tripId, before, after, TRIP_AUDITED);
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return { error: "رقم الرحلة مستخدم" };
      throw e;
    }
    touch(tripId); revalidatePath("/trips");
    return { ok: true };
  });
}

/** Soft delete, always allowed. Active bookings are cancelled (seats and rooms freed); payments are kept untouched. */
export async function deleteTrip(tripId: string): Promise<TripActionState> {
  return guarded("trips.write", async (u) => {
    const trip = await db.trip.findFirst({ where: { id: tripId, deletedAt: null } });
    if (!trip) return { error: "الرحلة غير موجودة" };
    await db.$transaction(async (tx) => {
      const bookings = await tx.booking.findMany({ where: { tripId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      const ids = bookings.map((b) => b.id);
      await tx.seatAssignment.deleteMany({ where: { bookingId: { in: ids } } });
      await tx.roomAssignment.deleteMany({ where: { bookingId: { in: ids } } });
      await tx.booking.updateMany({ where: { id: { in: ids } }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "حذف الرحلة" } });
      await tx.trip.update({ where: { id: tripId }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: u.id, userName: u.name, entity: "Trip", entityId: tripId, field: "deleted", oldValue: trip.name, newValue: `تم الحذف (${ids.length} حجز أُلغي)` } });
    });
    revalidatePath("/trips");
    return { ok: true };
  });
}
