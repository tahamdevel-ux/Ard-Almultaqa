"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { auditChanges } from "@/server/audit";
import { canSeeTrip } from "@/server/trips";
import { createOfficeRoom, deleteOfficeRoom, moveOfficeMember, renumberOfficeRooms, rerunAssignment, type OfficeResult } from "@/officeRooms/service";
import { ROOM_BEDS, type RoomTypeKey } from "@/domain/rooming";

export type OfficeActionState = { ok?: boolean; error?: string; info?: string };
const touch = (tripId: string) => revalidatePath(`/trips/${tripId}/office-rooms`);

async function guarded(tripId: string, perm: "officeRooms.write" | "officeRooms.renumber", fn: (u: Awaited<ReturnType<typeof requirePermission>>) => Promise<OfficeActionState>): Promise<OfficeActionState> {
  try {
    const u = await requirePermission(perm);
    const trip = await db.trip.findFirst({ where: { id: tripId, deletedAt: null } });
    if (!trip || !canSeeTrip(u, trip)) return { error: "الرحلة غير موجودة" };
    return await fn(u);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
const fromResult = (r: OfficeResult): OfficeActionState => (r.ok ? { ok: true } : { error: r.error });

export async function moveMember(tripId: string, bookingId: string, roomId: string | null): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.write", async () => { const r = fromResult(await db.$transaction((tx) => moveOfficeMember(tx, tripId, bookingId, roomId))); touch(tripId); return r; });
}

export async function newRoom(tripId: string, type: string): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.write", async () => {
    const t = type in ROOM_BEDS ? (type as RoomTypeKey) : null;
    const r = fromResult(await db.$transaction((tx) => createOfficeRoom(tx, tripId, t))); touch(tripId); return r;
  });
}

export async function removeRoom(tripId: string, roomId: string): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.write", async () => { const r = fromResult(await db.$transaction((tx) => deleteOfficeRoom(tx, tripId, roomId))); touch(tripId); return r; });
}

export async function toggleLock(tripId: string, roomId: string): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.write", async (u) => {
    await db.$transaction(async (tx) => {
      const before = await tx.officeRoom.findFirstOrThrow({ where: { id: roomId, tripId } });
      const after = await tx.officeRoom.update({ where: { id: roomId }, data: { locked: !before.locked } });
      await auditChanges(tx, u, "OfficeRoom", roomId, before, after, ["locked"]);
    });
    touch(tripId); return { ok: true };
  });
}

/** "أعد التوزيع": re-runs the automatic assignment on unlocked rooms and AUTO members only. */
export async function rerun(tripId: string): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.write", async () => {
    const r = await db.$transaction((tx) => rerunAssignment(tx, tripId));
    touch(tripId);
    return { ok: true, info: `أُعيد توزيع ${r.placed} معتمر${r.splitGroups.length ? ` — ${r.splitGroups.length} مجموعة أكبر من الغرفة فتوزعت` : ""}` };
  });
}

/** ADMIN only: renumbers every sequence without gaps (asked for with a confirmation dialog). */
export async function renumber(tripId: string): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.renumber", async (u) => {
    await db.$transaction(async (tx) => {
      await renumberOfficeRooms(tx, tripId);
      await tx.auditLog.create({ data: { userId: u.id, userName: u.name, entity: "OfficeRoom", entityId: tripId, field: "renumber", oldValue: null, newValue: "إعادة ترقيم" } });
    });
    touch(tripId); return { ok: true };
  });
}

/** The hotel's own room numbers of an office room (shown only on the hotel rooming lists). */
export async function saveHotelNos(tripId: string, roomId: string, makkah: string, madinah: string): Promise<OfficeActionState> {
  return guarded(tripId, "officeRooms.write", async (u) => {
    const clean = (v: string) => v.trim().slice(0, 20) || null;
    await db.$transaction(async (tx) => {
      const before = await tx.officeRoom.findFirstOrThrow({ where: { id: roomId, tripId } });
      const after = await tx.officeRoom.update({ where: { id: roomId }, data: { makkahHotelRoomNo: clean(makkah), madinahHotelRoomNo: clean(madinah) } });
      await auditChanges(tx, u, "OfficeRoom", roomId, before, after, ["makkahHotelRoomNo", "madinahHotelRoomNo"] as never);
    });
    touch(tripId); return { ok: true };
  });
}
