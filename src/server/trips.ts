import { db } from "./db";
import { passportExpiryWarning } from "@/domain/passport";
import { rangesOverlap } from "@/domain/dates";
import { tripCounter } from "@/domain/capacity";
import { DOC_LABELS, REQUIRED_DOCS } from "@/lib/labels";
import { getSetting } from "./settings";

export async function loadTripDetail(tripId: string) {
  const trip = await db.trip.findFirst({
    where: { id: tripId, deletedAt: null },
    include: { buses: { orderBy: { number: "asc" } }, flights: true, cars: true, supervisor: { select: { id: true, name: true } } },
  });
  if (!trip) return null;
  const bookings = await db.booking.findMany({
    where: { tripId, deletedAt: null, status: "ACTIVE" },
    include: {
      pilgrim: { include: { documents: { select: { type: true } } } },
      seat: { include: { bus: true, car: true } },
      groups: { include: { group: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const minMonths = await getSetting("passportMinMonths");
  const pilgrimIds = bookings.map((b) => b.pilgrimId);
  const others = await db.booking.findMany({
    where: { pilgrimId: { in: pilgrimIds }, tripId: { not: tripId }, status: "ACTIVE", deletedAt: null, trip: { deletedAt: null, status: { not: "CANCELLED" } } },
    include: { trip: true },
  });
  const rows = bookings.map((b) => {
    const have = new Set(b.pilgrim.documents.map((d) => d.type));
    const missingDocs = REQUIRED_DOCS.filter((t) => !have.has(t)).map((t) => DOC_LABELS[t]);
    const missing = [...missingDocs.map((d) => `ناقص: ${d}`)];
    if (b.visaStatus !== "ISSUED") missing.push("التأشيرة لم تصدر");
    const warnings: string[] = [];
    const pw = passportExpiryWarning(b.pilgrim.passportExpiry, trip.returnDate, minMonths);
    if (pw) warnings.push(pw);
    const overlap = others.find((o) => o.pilgrimId === b.pilgrimId && rangesOverlap(trip.departDate, trip.returnDate, o.trip.departDate, o.trip.returnDate));
    if (overlap) warnings.push(`متداخل مع الرحلة ${overlap.trip.tripNo}`);
    return { booking: b, missing, warnings, ready: missing.length === 0 };
  });
  const counter = tripCounter({ capacity: trip.capacity, bookings: rows.map((r) => ({ ready: r.ready, missing: r.missing })) });
  return { trip, rows, counter };
}

/** Returns Arabic warning text if the pilgrim is already booked on a trip whose dates truly overlap. */
export async function overlapWarning(pilgrimId: string, trip: { id: string; departDate: Date; returnDate: Date }) {
  const others = await db.booking.findMany({
    where: { pilgrimId, tripId: { not: trip.id }, status: "ACTIVE", deletedAt: null, trip: { deletedAt: null, status: { not: "CANCELLED" } } },
    include: { trip: true },
  });
  const o = others.find((x) => rangesOverlap(trip.departDate, trip.returnDate, x.trip.departDate, x.trip.returnDate));
  return o ? `المعتمر محجوز في الرحلة ${o.trip.tripNo} بتواريخ متداخلة` : null;
}

export function canSeeTrip(user: { id: string; role: string }, trip: { supervisorId: string | null }) {
  return user.role !== "SUPERVISOR" || trip.supervisorId === user.id;
}
