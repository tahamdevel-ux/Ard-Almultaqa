import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { overlapWarning } from "./trips";
import { autoSeatNewBooking, withTripLock } from "./buses";
import { assignOfficeRooms } from "@/officeRooms/service";
import { tripLabel } from "@/lib/tripLabel";

type Client = Prisma.TransactionClient | typeof db;

export type AddToTripsResult = {
  added: string[]; // trip ids where a booking was created or reactivated
  bookingIds?: Record<string, string>; // trip id -> booking id of those additions
  skipped: string[]; // trip ids where the pilgrim was already booked (active)
  missing: string[]; // trip ids that do not exist / are deleted
};

/**
 * Adds one pilgrim to several trips. Overlapping dates are always allowed;
 * the only refusal is the same pilgrim twice in the same trip (a cancelled
 * booking on that trip is reactivated). Safe to call inside a transaction.
 */
/** `officeRooms: false` lets a bulk caller (the import) assign all new bookings to office rooms once, at the end. */
export async function addPilgrimToTrips(client: Client, pilgrimId: string, agentId: string | null, tripIds: string[], opts: { officeRooms?: boolean; skipOfficeTrips?: string[] } = {}): Promise<AddToTripsResult> {
  const out: AddToTripsResult = { added: [], skipped: [], missing: [] };
  for (const tripId of [...new Set(tripIds)]) {
    const trip = await client.trip.findFirst({ where: { id: tripId, deletedAt: null }, select: { id: true } });
    if (!trip) { out.missing.push(tripId); continue; }
    const existing = await client.booking.findUnique({ where: { pilgrimId_tripId: { pilgrimId, tripId } } });
    if (existing && existing.status === "ACTIVE" && !existing.deletedAt) { out.skipped.push(tripId); continue; }
    let bookingId = "";
    await withTripLock(client, tripId, async (tx) => {
      const booking = existing
        ? await tx.booking.update({ where: { id: existing.id }, data: { status: "ACTIVE", deletedAt: null, cancelledAt: null, cancelReason: null } })
        : await tx.booking.create({ data: { pilgrimId, tripId, agentId } });
      bookingId = booking.id;
      await autoSeatNewBooking(tx, tripId, booking.id); // land trips only
      if (opts.officeRooms !== false && !opts.skipOfficeTrips?.includes(tripId)) await assignOfficeRooms(tx, tripId, [booking.id]); // internal office room, automatic
    });
    out.added.push(tripId);
    (out.bookingIds ??= {})[tripId] = bookingId;
  }
  return out;
}

/** Informational overlap warnings for trips just added (never blocks). */
export async function overlapWarnings(pilgrimId: string, tripIds: string[]): Promise<string[]> {
  const w: string[] = [];
  for (const id of tripIds) {
    const trip = await db.trip.findUnique({ where: { id } });
    if (!trip) continue;
    const m = await overlapWarning(pilgrimId, trip);
    if (m) w.push(`${tripLabel(trip)}: ${m}`);
  }
  return w;
}

/** Arabic summary: "أُضيف لـ 2، والباقي كان موجوداً". */
export function summarizeAdd(r: AddToTripsResult): string {
  const parts: string[] = [];
  if (r.added.length) parts.push(`أُضيف لـ ${r.added.length} ${r.added.length === 1 ? "رحلة" : "رحلات"}`);
  if (r.skipped.length) parts.push(r.added.length ? "والباقي كان موجوداً فيها مسبقاً" : "المعتمر موجود مسبقاً في الرحلات المحددة");
  if (r.missing.length) parts.push("رحلة غير موجودة تم تجاهلها");
  return parts.join("، ");
}
