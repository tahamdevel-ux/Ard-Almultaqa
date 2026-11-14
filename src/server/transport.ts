import { db } from "./db";
import type { SessionUser } from "./auth";
import { auditChanges } from "./audit";
import { seatOnBus, withTripLock } from "./buses";
import { isMode, type TransportMode } from "@/domain/transport";

export type TransportResult = { ok: true } | { ok: false; error: string };

/**
 * Sets how one pilgrim travels. BUS puts him on a free bus seat (keeping his seat if he already has one); CAR needs one of the trip's
 * cars; FLIGHT optionally names one of the trip's flights. Leaving the bus frees the seat. All-or-nothing under the trip lock.
 */
export async function setTransport(user: SessionUser, tripId: string, bookingId: string, input: { mode: string; carId?: string | null; flightId?: string | null }, client: Parameters<typeof withTripLock>[0] = db): Promise<TransportResult> {
  if (!isMode(input.mode)) return { ok: false, error: "اختر وسيلة النقل" };
  const mode: TransportMode = input.mode;
  return withTripLock(client, tripId, async (tx) => {
    const b = await tx.booking.findFirst({ where: { id: bookingId, tripId, status: "ACTIVE", deletedAt: null }, include: { seat: true, trip: true } });
    if (!b) return { ok: false, error: "الحجز غير موجود" } as TransportResult;
    if (mode === "CAR") {
      if (!input.carId) return { ok: false, error: "اختر السيارة" } as TransportResult;
      if (!(await tx.groundCar.findFirst({ where: { id: input.carId, tripId } }))) return { ok: false, error: "السيارة ليست من هذه الرحلة" } as TransportResult;
      await tx.seatAssignment.upsert({ where: { bookingId }, create: { bookingId, carId: input.carId }, update: { carId: input.carId, busId: null, seatNo: null, flightId: null } });
    } else if (mode === "FLIGHT") {
      if (input.flightId && !(await tx.flight.findFirst({ where: { id: input.flightId, tripId } }))) return { ok: false, error: "الرحلة الجوية ليست من هذه الرحلة" } as TransportResult;
      if (input.flightId) await tx.seatAssignment.upsert({ where: { bookingId }, create: { bookingId, flightId: input.flightId }, update: { flightId: input.flightId, busId: null, seatNo: null, carId: null } });
      else await tx.seatAssignment.deleteMany({ where: { bookingId } });
    } else if (!b.seat?.busId) {
      await tx.seatAssignment.deleteMany({ where: { bookingId } });
      await seatOnBus(tx, tripId, bookingId);
    }
    // the trip's default mode is stored as "no choice", so a later change of the trip type keeps meaning what it says
    const isDefault = mode === (b.trip.transportType === "LAND" ? "BUS" : "FLIGHT");
    const after = await tx.booking.update({ where: { id: bookingId }, data: { transport: isDefault ? null : mode } });
    await auditChanges(tx, user, "Booking", bookingId, b, after, ["transport"] as never);
    return { ok: true } as TransportResult;
  });
}
