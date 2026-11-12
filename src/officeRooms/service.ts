import type { Prisma } from "@prisma/client";
import { db, type DbTx } from "@/server/db";
import { getSetting } from "@/server/settings";
import {
  capacityFor, categoryOf, codeFor, nextSeq, planAssignments, renumber,
  type OfficeMember, type OfficePerson, type OfficeRoomState, type TripContext,
} from "@/domain/officeRooms";
import type { RoomTypeKey } from "@/domain/rooming";

type Tx = DbTx;
type DbLike = Tx | typeof db;

const bookingInclude = { pilgrim: { select: { gender: true } }, groups: { include: { group: true } }, seat: { select: { busId: true } }, officeMember: true } satisfies Prisma.BookingInclude;
// the money columns are not needed here (and the app client returns them as numbers, not Decimals)
type BookingRow = Omit<Prisma.BookingGetPayload<{ include: typeof bookingInclude }>, "priceAmount" | "sarfAmount">;

export function personOf(b: BookingRow): OfficePerson {
  return {
    bookingId: b.id, gender: b.pilgrim.gender, groupIds: b.groups.map((g) => g.groupId), inFamily: b.groups.some((g) => g.group.kind === "FAMILY"),
    roomType: (b.roomType as RoomTypeKey | null) ?? null, agentId: b.agentId, busId: b.seat?.busId ?? null, hotelId: b.tripHotelId, noHousing: b.noHousing,
  };
}

export interface OfficeState {
  trip: { id: string; transportType: "LAND" | "AIR" };
  defaultCapacity: number;
  ctx: TripContext;
  rooms: OfficeRoomState[];
  bookings: BookingRow[];
}

/** Everything the planner needs for one trip. */
export async function loadOfficeState(tx: DbLike, tripId: string): Promise<OfficeState> {
  const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { id: true, transportType: true } });
  const [defaultCapacity, bookings, agents, roomsRaw] = await Promise.all([
    getSetting("officeRoomCapacity"),
    tx.booking.findMany({ where: { tripId, status: "ACTIVE", deletedAt: null }, include: bookingInclude, orderBy: { createdAt: "asc" } }),
    tx.agent.findMany({ select: { id: true, roomCode: true } }),
    tx.officeRoom.findMany({ where: { tripId }, include: { members: true } }),
  ]);
  const byBooking = new Map(bookings.map((b) => [b.id, b]));
  const agentCodes = new Map(agents.map((a) => [a.id, a.roomCode]));
  // a bus carries only one agent's pilgrims when every seated, active booking on it has the same agent
  const busAgents = new Map<string, Set<string | null>>();
  for (const b of bookings) if (b.seat?.busId) busAgents.set(b.seat.busId, (busAgents.get(b.seat.busId) ?? new Set()).add(b.agentId));
  const busAgent = new Map<string, string | null>([...busAgents].map(([bus, set]) => [bus, set.size === 1 ? [...set][0] : null]));
  const rooms: OfficeRoomState[] = roomsRaw.map((r) => ({
    id: r.id, code: r.code, seq: r.seq, capacity: r.capacity, roomType: r.roomType as RoomTypeKey | null, category: r.category, locked: r.locked, hotelId: r.tripHotelId,
    members: r.members.flatMap((m): OfficeMember[] => { const b = byBooking.get(m.bookingId); return b ? [{ ...personOf(b), assignedBy: m.assignedBy }] : []; }),
  }));
  return { trip: { id: trip.id, transportType: trip.transportType }, defaultCapacity, ctx: { transport: trip.transportType, agentCodes, busAgent }, rooms, bookings };
}

/** Category and agent code follow the members; an empty room keeps both and its number. */
async function recompute(tx: Tx, roomId: string, state: OfficeState) {
  const room = await tx.officeRoom.findUniqueOrThrow({ where: { id: roomId }, include: { members: true } });
  if (!room.members.length) return;
  // a room someone was put in by hand keeps its label: the staff chose that number
  const manual = room.members.some((m) => m.assignedBy === "MANUAL");
  const people = room.members.flatMap((m) => { const b = state.bookings.find((x) => x.id === m.bookingId); return b ? [personOf(b)] : []; });
  const category = categoryOf(people);
  const code = codeFor(people, state.ctx);
  const data: Prisma.OfficeRoomUpdateInput = { category };
  const hotelId = people.find((p) => !p.noHousing)?.hotelId;
  if (hotelId !== undefined && !manual) data.tripHotel = hotelId ? { connect: { id: hotelId } } : { disconnect: true };
  if (!manual && (room.code ?? "") !== (code ?? "")) {
    const others = await tx.officeRoom.findMany({ where: { tripId: room.tripId, NOT: { id: room.id } }, select: { code: true, seq: true } });
    data.code = code; data.seq = nextSeq(others, code);
  }
  await tx.officeRoom.update({ where: { id: room.id }, data });
}

/**
 * Puts bookings that are in no office room yet into rooms (new booking, import, re-run). `bookingIds` limits it to
 * those bookings; omitted = every active booking without a room.
 */
export async function assignOfficeRooms(tx: Tx, tripId: string, bookingIds?: string[], by: "AUTO" | "MANUAL" = "AUTO") {
  const state = await loadOfficeState(tx, tripId);
  const housed = new Set(state.rooms.flatMap((r) => r.members.map((m) => m.bookingId)));
  const people = state.bookings.filter((b) => !housed.has(b.id) && (!bookingIds || bookingIds.includes(b.id))).map(personOf);
  if (!people.length) return { placed: 0, splitGroups: [] as string[] };
  const plan = planAssignments(state.rooms, people, state.ctx, state.defaultCapacity);
  const created = new Map<string, string>();
  for (const nr of plan.newRooms) {
    const r = await tx.officeRoom.create({ data: { tripId, code: nr.code, seq: nr.seq, capacity: nr.capacity, roomType: nr.roomType, category: nr.category, tripHotelId: nr.hotelId } });
    created.set(nr.tempId, r.id);
  }
  const touched = new Set<string>();
  for (const [bookingId, rid] of plan.placements) {
    const roomId = created.get(rid) ?? rid;
    await tx.officeRoomMember.create({ data: { officeRoomId: roomId, bookingId, assignedBy: by } });
    touched.add(roomId);
  }
  const fresh = await loadOfficeState(tx, tripId);
  for (const id of touched) await recompute(tx, id, fresh);
  return { placed: plan.placements.size, splitGroups: plan.splitGroups };
}

/**
 * A family or companion group is put in the same office room automatically: its members that were placed by the system
 * (AUTO, in unlocked rooms) are taken out and placed again together; hand-placed members and locked rooms stay as they are.
 */
export async function gatherGroupInOfficeRooms(tx: Tx, tripId: string, groupId: string) {
  const members = await tx.bookingGroupMember.findMany({ where: { groupId, booking: { tripId, status: "ACTIVE", deletedAt: null } }, select: { bookingId: true } });
  const ids = members.map((m) => m.bookingId);
  if (ids.length < 2) return { placed: 0, splitGroups: [] as string[] };
  await tx.officeRoomMember.deleteMany({ where: { bookingId: { in: ids }, assignedBy: "AUTO", officeRoom: { locked: false } } });
  return assignOfficeRooms(tx, tripId, ids);
}

/** A cancelled / removed / moved booking leaves its room; the room keeps its number. */
export async function freeOfficeBeds(tx: DbLike, bookingIds: string[]) {
  if (bookingIds.length) await tx.officeRoomMember.deleteMany({ where: { bookingId: { in: bookingIds } } });
}

/** "أعد التوزيع": AUTO members of unlocked rooms are re-placed; locked rooms and MANUAL members stay. */
export async function rerunAssignment(tx: Tx, tripId: string) {
  await tx.officeRoomMember.deleteMany({ where: { assignedBy: "AUTO", officeRoom: { tripId, locked: false } } });
  return assignOfficeRooms(tx, tripId);
}

export type OfficeResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): OfficeResult => ({ ok: false, error });

/** Drag and drop / select: moves a pilgrim (MANUAL). roomId null = out of every room. */
export async function moveOfficeMember(tx: Tx, tripId: string, bookingId: string, roomId: string | null): Promise<OfficeResult> {
  const b = await tx.booking.findFirst({ where: { id: bookingId, tripId, status: "ACTIVE", deletedAt: null }, include: { officeMember: true } });
  if (!b) return fail("الحجز غير موجود");
  const from = b.officeMember?.officeRoomId ?? null;
  if (roomId === from) return { ok: true };
  if (from) { const src = await tx.officeRoom.findUnique({ where: { id: from } }); if (src?.locked) return fail("الغرفة التي يوجد فيها المعتمر مقفلة"); }
  if (roomId) {
    const room = await tx.officeRoom.findFirst({ where: { id: roomId, tripId }, include: { members: true } });
    if (!room) return fail("الغرفة غير موجودة");
    if (room.locked) return fail("الغرفة مقفلة");
    const housedNow = await tx.officeRoomMember.count({ where: { officeRoomId: roomId, booking: { noHousing: false } } });
    if (!b.noHousing && housedNow >= room.capacity) return fail("الغرفة ممتلئة");
  }
  await tx.officeRoomMember.deleteMany({ where: { bookingId } });
  if (roomId) await tx.officeRoomMember.create({ data: { officeRoomId: roomId, bookingId, assignedBy: "MANUAL" } });
  const state = await loadOfficeState(tx, tripId);
  for (const id of [from, roomId]) if (id) await recompute(tx, id, state);
  return { ok: true };
}

export async function createOfficeRoom(tx: Tx, tripId: string, roomType: RoomTypeKey | null = null): Promise<OfficeResult> {
  const state = await loadOfficeState(tx, tripId);
  await tx.officeRoom.create({ data: { tripId, code: null, seq: nextSeq(state.rooms, null), capacity: capacityFor(roomType, state.defaultCapacity), roomType, category: "MEN" } });
  return { ok: true };
}

export async function deleteOfficeRoom(tx: Tx, tripId: string, roomId: string): Promise<OfficeResult> {
  const room = await tx.officeRoom.findFirst({ where: { id: roomId, tripId }, include: { _count: { select: { members: true } } } });
  if (!room) return fail("الغرفة غير موجودة");
  if (room._count.members) return fail("انقل المعتمرين من الغرفة أولاً");
  await tx.officeRoom.delete({ where: { id: roomId } });
  return { ok: true };
}

/** ADMIN: renumber every sequence without gaps (per code). */
export async function renumberOfficeRooms(tx: Tx, tripId: string) {
  const rooms = await tx.officeRoom.findMany({ where: { tripId }, select: { id: true, code: true, seq: true } });
  const map = renumber(rooms);
  // two steps so the unique (trip, code, seq) never collides while numbers shift
  for (const r of rooms) await tx.officeRoom.update({ where: { id: r.id }, data: { seq: r.seq + 100000 } });
  for (const r of rooms) await tx.officeRoom.update({ where: { id: r.id }, data: { seq: map.get(r.id)! } });
}

/** "a1" or "2": the label staff type when adding a pilgrim. Letters = an agent code, digits = the number. */
export function parseRoomLabel(raw: string): { code: string | null; seq: number } | null {
  const m = /^([a-z]{0,2})(\d{1,4})$/i.exec(raw.trim());
  return m ? { code: m[1] ? m[1].toLowerCase() : null, seq: Number(m[2]) } : null;
}

/**
 * Puts a booking in the office room with this label (created when it does not exist yet), as a MANUAL placement.
 * Everyone put in "1" ends up together; the room must have a free bed and not be locked.
 */
export async function placeInRoomByLabel(tx: Tx, tripId: string, bookingId: string, label: string): Promise<OfficeResult> {
  const parsed = parseRoomLabel(label);
  if (!parsed) return fail("رقم غرفة المكتب غير صحيح (مثل 1 أو a3)");
  const b = await tx.booking.findFirst({ where: { id: bookingId, tripId, status: "ACTIVE", deletedAt: null }, include: bookingInclude });
  if (!b) return fail("الحجز غير موجود");
  let room = await tx.officeRoom.findFirst({ where: { tripId, code: parsed.code, seq: parsed.seq }, include: { members: true } });
  if (room?.members.some((m) => m.bookingId === bookingId)) return { ok: true };
  if (room?.locked) return fail(`غرفة المكتب ${label} مقفلة`);
  if (room && !b.noHousing && (await tx.officeRoomMember.count({ where: { officeRoomId: room.id, booking: { noHousing: false } } })) >= room.capacity) return fail(`غرفة المكتب ${label} ممتلئة`);
  const state = await loadOfficeState(tx, tripId);
  const person = personOf(b);
  if (!room) {
    const roomType = person.roomType;
    const created = await tx.officeRoom.create({ data: { tripId, code: parsed.code, seq: parsed.seq, capacity: capacityFor(roomType, state.defaultCapacity), roomType, category: categoryOf([person]), tripHotelId: person.hotelId } });
    room = { ...created, members: [] };
  }
  const from = b.officeMember?.officeRoomId ?? null;
  await tx.officeRoomMember.deleteMany({ where: { bookingId } });
  await tx.officeRoomMember.create({ data: { officeRoomId: room.id, bookingId, assignedBy: "MANUAL" } });
  const fresh = await loadOfficeState(tx, tripId);
  for (const id of [from, room.id]) if (id) await recompute(tx, id, fresh);
  return { ok: true };
}
