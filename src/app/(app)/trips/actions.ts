"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { AuthError, requirePermission, type SessionUser } from "@/server/auth";
import { normalizePassportNo } from "@/domain/passport";
import { autoSeat, validateSeat } from "@/domain/seating";
import { overlapWarning } from "@/server/trips";
import { getSetting } from "@/server/settings";
import { parseDate } from "@/domain/dates";

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
    if (!s(f, "number")) return { error: "رقم الباص مطلوب" };
    await db.bus.create({ data: { tripId, number: s(f, "number"), driverName: s(f, "driverName") || null, driverPhone: s(f, "driverPhone") || null, company: s(f, "company") || null, seatCount: +s(f, "seatCount") || 48 } });
    touch(tripId); return { ok: true };
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

export async function addBooking(tripId: string, _p: TripActionState, f: FormData): Promise<TripActionState> {
  return guarded("bookings.write", async () => {
    const trip = await db.trip.findFirst({ where: { id: tripId, deletedAt: null } });
    if (!trip) return { error: "الرحلة غير موجودة" };
    const passportNo = normalizePassportNo(s(f, "passportNo"));
    const pilgrim = await db.pilgrim.findFirst({ where: { passportNo, deletedAt: null } });
    if (!pilgrim) return { error: "لا يوجد معتمر بهذا رقم الجواز. سجّله أولاً من شاشة المعتمرين" };
    const existing = await db.booking.findUnique({ where: { pilgrimId_tripId: { pilgrimId: pilgrim.id, tripId } } });
    if (existing && existing.status === "ACTIVE" && !existing.deletedAt) return { error: "المعتمر مضاف مسبقاً لهذه الرحلة" };
    if (existing) await db.booking.update({ where: { id: existing.id }, data: { status: "ACTIVE", deletedAt: null } });
    else await db.booking.create({ data: { pilgrimId: pilgrim.id, tripId, agentId: pilgrim.agentId } });
    const warning = await overlapWarning(pilgrim.id, trip);
    touch(tripId);
    return { ok: true, warning: warning ?? undefined };
  });
}

export async function removeBooking(tripId: string, bookingId: string) {
  await requirePermission("bookings.write");
  await db.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
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
  const days = Math.round((t.returnDate.getTime() - t.departDate.getTime()) / 86400000);
  await db.program.create({ data: {
    name: t.name, transportType: t.transportType, nightsMakkah: t.nightsMakkah, nightsMadinah: t.nightsMadinah, firstCity: t.firstCity,
    makkahHotelId: t.makkahHotelId, madinahHotelId: t.madinahHotelId, capacity: t.capacity,
    busCount: t.buses.length, seatsPerBus: t.buses[0]?.seatCount ?? 48, durationDays: days,
  } });
  revalidatePath("/programs");
}
