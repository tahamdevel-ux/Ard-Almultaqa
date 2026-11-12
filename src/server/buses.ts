import type { Prisma } from "@prisma/client";
import { db, type DbTx } from "./db";
import { autoSeat } from "@/domain/seating";
import { roleConflict, type TripRole } from "@/domain/tripRoles";

type Tx = DbTx;
const DEFAULT_SEATS = 48;

/** Run `fn` inside a transaction holding a per-trip lock, so two people adding pilgrims never double-book a seat. */
export async function withTripLock<T>(client: Tx | typeof db, tripId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const run = async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"bus:" + tripId}))`;
    return fn(tx);
  };
  return "$transaction" in client ? client.$transaction(run) : run(client);
}

const numeric = (n: string) => (/^\d+$/.test(n) ? parseInt(n, 10) : 0);

/** Land trips always have at least bus 1. Call inside withTripLock. */
export async function ensureFirstBus(tx: Tx, tripId: string, seatCount = DEFAULT_SEATS) {
  const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { transportType: true } });
  if (!trip || trip.transportType !== "LAND") return;
  if ((await tx.bus.count({ where: { tripId } })) === 0) await tx.bus.create({ data: { tripId, number: "1", seatCount } });
}

/**
 * Seats a new booking on the first general (unnamed) bus that has a free seat (lowest free seat).
 * When every general bus is full, the next numbered bus is opened with the same seat count.
 * Named (manual) buses are never filled automatically.
 */
export async function autoSeatNewBooking(tx: Tx, tripId: string, bookingId: string): Promise<void> {
  const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { transportType: true } });
  if (!trip || trip.transportType !== "LAND") return;
  if (await tx.seatAssignment.findUnique({ where: { bookingId } })) return;
  await seatOnBus(tx, tripId, bookingId);
}

/** Puts a booking on the first free seat of the trip's general buses (opening a new bus when all are full). */
export async function seatOnBus(tx: Tx, tripId: string, bookingId: string): Promise<void> {
  await ensureFirstBus(tx, tripId);
  const buses = (await tx.bus.findMany({ where: { tripId }, include: { seats: { select: { seatNo: true } } } }))
    .sort((a, b) => numeric(a.number) - numeric(b.number));
  let lastGeneral: (typeof buses)[number] | undefined;
  for (const bus of buses.filter((b) => !b.name)) {
    lastGeneral = bus;
    const taken = new Set(bus.seats.map((s) => s.seatNo).filter((n): n is number => n != null));
    for (let n = 1; n <= bus.seatCount; n++) {
      if (!taken.has(n)) { await tx.seatAssignment.create({ data: { bookingId, busId: bus.id, seatNo: n } }); return; }
    }
  }
  const usedNos = new Set(buses.map((b) => b.number));
  let nextNo = Math.max(0, ...buses.filter((b) => !b.name).map((b) => numeric(b.number))) + 1;
  while (usedNos.has(String(nextNo))) nextNo++;
  const bus = await tx.bus.create({ data: { tripId, number: String(nextNo), seatCount: lastGeneral?.seatCount ?? buses[0]?.seatCount ?? DEFAULT_SEATS } });
  await tx.seatAssignment.create({ data: { bookingId, busId: bus.id, seatNo: 1 } });
}

export type MoveResult = { ok: true; moved: number } | { ok: false; error: string };

/**
 * Moves seated/unseated bookings to a target bus. Members of the same family/companion group move together
 * and are placed in consecutive seats. Refuses (changing nothing) if the target lacks free seats.
 */
export async function moveBookingsToBus(tripId: string, targetBusId: string, bookingIds: string[]): Promise<MoveResult> {
  return withTripLock(db, tripId, async (tx) => {
    const bus = await tx.bus.findFirst({ where: { id: targetBusId, tripId } });
    if (!bus) return { ok: false, error: "الباص غير موجود" } as MoveResult;
    const chosen = await tx.booking.findMany({ where: { id: { in: bookingIds }, tripId, status: "ACTIVE", deletedAt: null }, include: { groups: true, pilgrim: true } });
    if (!chosen.length) return { ok: false, error: "لم يتم اختيار معتمرين" } as MoveResult;
    // pull in the rest of each group so families/companions are never split
    const groupIds = new Set(chosen.flatMap((b) => b.groups.map((g) => g.groupId)));
    const familyIds = new Set(chosen.map((b) => b.pilgrim.familyGroupId).filter((x): x is string => !!x));
    const mates = await tx.booking.findMany({
      where: { tripId, status: "ACTIVE", deletedAt: null, id: { notIn: chosen.map((b) => b.id) }, OR: [{ groups: { some: { groupId: { in: [...groupIds] } } } }, { pilgrim: { familyGroupId: { in: [...familyIds] } } }] },
      include: { groups: true, pilgrim: true },
    });
    const all = [...chosen, ...mates];
    for (const b of all) { const c = await busRoleConflict(tx, targetBusId, (b.tripRole as TripRole | null) ?? null, b.id); if (c) return { ok: false, error: c } as MoveResult; }
    const ids = new Set(all.map((b) => b.id));
    const taken = await tx.seatAssignment.findMany({ where: { busId: targetBusId } });
    const occ = new Map<number, string>();
    for (const t of taken) if (t.seatNo != null && !ids.has(t.bookingId)) occ.set(t.seatNo, t.bookingId);
    const plan = autoSeat(bus.seatCount, occ, all.map((b) => ({ bookingId: b.id, groupId: b.groups[0]?.groupId ?? b.pilgrim.familyGroupId })));
    if (plan.size < all.length) return { ok: false, error: `لا توجد مقاعد كافية في هذا الباص (المطلوب ${all.length}، المتاح ${bus.seatCount - occ.size})` } as MoveResult;
    await tx.seatAssignment.deleteMany({ where: { bookingId: { in: [...ids] } } });
    for (const [bookingId, seatNo] of plan) await tx.seatAssignment.create({ data: { bookingId, busId: targetBusId, seatNo } });
    return { ok: true, moved: all.length } as MoveResult;
  });
}

/** Role (متعهد / سايق / مساعد سايق) clash on a bus: null when the booking may hold `role` on `busId`. */
export async function busRoleConflict(tx: Tx | typeof db, busId: string | null, role: TripRole | null, bookingId: string): Promise<string | null> {
  if (!busId || !role) return null;
  const holders = await tx.booking.findMany({ where: { status: "ACTIVE", deletedAt: null, tripRole: { not: null }, seat: { busId } }, select: { id: true, tripRole: true } });
  return roleConflict(holders.map((h) => ({ bookingId: h.id, role: h.tripRole as TripRole, busId })), { bookingId, role, busId });
}
