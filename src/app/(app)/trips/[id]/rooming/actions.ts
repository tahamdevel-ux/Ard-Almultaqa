"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { autoAssignRooms, canPlace, ROOM_BEDS, type Occupant } from "@/domain/rooming";

export type RoomingResult = { error?: string; ok?: boolean; info?: string };
type City = "MAKKAH" | "MADINAH";
const touch = (tripId: string) => revalidatePath(`/trips/${tripId}/rooming`);

async function guarded(fn: () => Promise<RoomingResult>): Promise<RoomingResult> {
  try { await requirePermission("rooming.write"); return await fn(); } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

async function loadRoomState(tripId: string, city: City) {
  const rooms = await db.room.findMany({
    where: { tripId, city },
    include: { assignments: { include: { booking: { include: { pilgrim: { select: { gender: true } }, groups: true } } } } },
  });
  return rooms.map((r) => ({
    id: r.id, roomNo: r.roomNo, beds: r.beds,
    occupants: r.assignments.map((a): Occupant => ({ bookingId: a.bookingId, gender: a.booking.pilgrim.gender, groupIds: a.booking.groups.map((g) => g.groupId) })),
  }));
}

async function occupantOf(tripId: string, bookingId: string): Promise<Occupant | null> {
  const b = await db.booking.findFirst({ where: { id: bookingId, tripId, status: "ACTIVE", deletedAt: null }, include: { pilgrim: { select: { gender: true } }, groups: true } });
  return b ? { bookingId, gender: b.pilgrim.gender, groupIds: b.groups.map((g) => g.groupId) } : null;
}

export async function addRooms(tripId: string, city: City, f: FormData): Promise<RoomingResult> {
  return guarded(async () => {
    const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null } });
    const hotelId = city === "MAKKAH" ? trip.makkahHotelId : trip.madinahHotelId;
    if (!hotelId) return { error: "حدّد فندق هذه المدينة للرحلة أولاً" };
    const type = String(f.get("type")) as keyof typeof ROOM_BEDS;
    if (!(type in ROOM_BEDS)) return { error: "نوع الغرفة غير صحيح" };
    const count = Math.min(200, Math.max(1, +String(f.get("count")) || 1));
    const start = Math.max(1, +String(f.get("start")) || 1);
    const prefix = String(f.get("prefix") ?? "").trim();
    const existing = new Set((await db.room.findMany({ where: { tripId, city }, select: { roomNo: true } })).map((r) => r.roomNo));
    const data = [];
    for (let i = 0; i < count; i++) {
      const roomNo = `${prefix}${start + i}`;
      if (existing.has(roomNo)) return { error: `الغرفة ${roomNo} موجودة مسبقاً` };
      data.push({ tripId, city, hotelId, roomNo, type, beds: ROOM_BEDS[type] });
    }
    await db.room.createMany({ data });
    touch(tripId); return { ok: true };
  });
}

export async function deleteRoom(tripId: string, roomId: string): Promise<RoomingResult> {
  return guarded(async () => { await db.room.deleteMany({ where: { id: roomId, tripId } }); touch(tripId); return { ok: true }; });
}

/** roomId null = back to the unhoused pool. */
export async function moveBooking(tripId: string, city: City, bookingId: string, roomId: string | null): Promise<RoomingResult> {
  return guarded(async () => {
    const occ = await occupantOf(tripId, bookingId);
    if (!occ) return { error: "الحجز غير موجود" };
    if (roomId === null) {
      await db.roomAssignment.deleteMany({ where: { bookingId, city } });
      touch(tripId); return { ok: true };
    }
    const state = (await loadRoomState(tripId, city)).find((r) => r.id === roomId);
    if (!state) return { error: "الغرفة غير موجودة" };
    const err = canPlace(state, occ);
    if (err) return { error: err };
    await db.roomAssignment.upsert({ where: { bookingId_city: { bookingId, city } }, create: { roomId, bookingId, city }, update: { roomId } });
    touch(tripId); return { ok: true };
  });
}

export async function autoAssign(tripId: string, city: City): Promise<RoomingResult> {
  return guarded(async () => {
    const rooms = await loadRoomState(tripId, city);
    if (!rooms.length) return { error: "أضف غرفاً أولاً" };
    const housed = new Set(rooms.flatMap((r) => r.occupants.map((o) => o.bookingId)));
    const bookings = await db.booking.findMany({
      where: { tripId, status: "ACTIVE", deletedAt: null }, include: { pilgrim: { select: { gender: true } }, groups: true }, orderBy: { createdAt: "asc" },
    });
    const people = bookings.filter((b) => !housed.has(b.id)).map((b): Occupant => ({ bookingId: b.id, gender: b.pilgrim.gender, groupIds: b.groups.map((g) => g.groupId) }));
    const r = autoAssignRooms(rooms, people);
    await db.$transaction([...r.assignments].map(([bookingId, roomId]) => db.roomAssignment.create({ data: { bookingId, roomId, city } })));
    touch(tripId);
    const notes = [];
    if (r.unplaced.length) notes.push(`تعذّر تسكين ${r.unplaced.length} معتمر (لا توجد غرف مناسبة)`);
    if (r.splitGroups.length) notes.push(`${r.splitGroups.length} مجموعة تفرّقت على أكثر من غرفة لأنها أكبر من أكبر غرفة`);
    return { ok: true, info: `تم تسكين ${r.assignments.size} معتمر. ${notes.join(". ")}` };
  });
}

export async function clearCity(tripId: string, city: City): Promise<RoomingResult> {
  return guarded(async () => { await db.roomAssignment.deleteMany({ where: { city, room: { tripId } } }); touch(tripId); return { ok: true }; });
}
