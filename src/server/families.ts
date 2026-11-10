import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;
export interface FamilyChoice { isHead: boolean; headOf: string }

/** Form fields per trip: isHead__<tripId> (checkbox "رب الأسرة") and headOf__<tripId> (the head's booking id). */
export function familyForTrip(f: FormData, tripId: string): FamilyChoice {
  return { isHead: f.get(`isHead__${tripId}`) === "on", headOf: String(f.get(`headOf__${tripId}`) ?? "").trim() };
}

/** Makes the booking the head of a new family, or links it to an existing head of the same trip. Returns an Arabic error or null. */
export async function applyFamilyChoice(tx: Tx, tripId: string, bookingId: string, c: FamilyChoice): Promise<string | null> {
  if (!c.isHead && !c.headOf) return null;
  if (c.isHead && c.headOf) return "لا يمكن أن يكون المعتمر رب أسرة وتابعاً لرب أسرة في نفس الوقت";
  await tx.bookingGroupMember.deleteMany({ where: { bookingId } });
  if (c.isHead) {
    const g = await tx.familyGroup.create({ data: { kind: "FAMILY" } });
    await tx.bookingGroupMember.create({ data: { bookingId, groupId: g.id, isHead: true } });
    return null;
  }
  const head = await tx.bookingGroupMember.findFirst({
    where: { bookingId: c.headOf, isHead: true, group: { kind: "FAMILY" }, booking: { tripId, status: "ACTIVE", deletedAt: null } },
  });
  if (!head) return "رب الأسرة المختار غير موجود في هذه الرحلة";
  await tx.bookingGroupMember.create({ data: { bookingId, groupId: head.groupId } });
  return null;
}

/** Heads of family per trip, for the "تابع لرب أسرة" pickers. */
export async function headsByTrip(tripIds: string[]): Promise<Record<string, { bookingId: string; name: string }[]>> {
  const rows = await db.bookingGroupMember.findMany({
    where: { isHead: true, group: { kind: "FAMILY" }, booking: { tripId: { in: tripIds }, status: "ACTIVE", deletedAt: null } },
    include: { booking: { include: { pilgrim: true } } },
  });
  const out: Record<string, { bookingId: string; name: string }[]> = {};
  for (const r of rows) (out[r.booking.tripId] ??= []).push({ bookingId: r.booking.id, name: [r.booking.pilgrim.firstName, r.booking.pilgrim.fatherName, r.booking.pilgrim.grandfatherName, r.booking.pilgrim.familyName].filter(Boolean).join(" ") });
  return out;
}
