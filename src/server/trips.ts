import { db } from "./db";
import { passportExpiryWarning } from "@/domain/passport";
import { tripsOverlap } from "@/domain/dates";
import { dateRangeLabel, tripLabel } from "@/lib/tripLabel";
import { tripCounter } from "@/domain/capacity";
import { readiness } from "@/domain/readiness";
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
      pilgrim: true,
      seat: { include: { bus: true, car: true } },
      groups: { include: { group: true } },
      payments: true,
      rooms: { include: { room: { include: { hotel: true } } } },
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
    const { ready } = readiness({ bookingActive: true, passportNo: b.pilgrim.passportNo });
    const warnings: string[] = [];
    const pw = passportExpiryWarning(b.pilgrim.passportExpiry, trip.returnDate, minMonths);
    if (pw) warnings.push(pw);
    const overlap = others.find((o) => o.pilgrimId === b.pilgrimId && tripsOverlap(trip, o.trip));
    if (overlap) warnings.push(`متداخل مع الرحلة ${tripLabel(overlap.trip)}`);
    return { booking: b, warnings, ready };
  });
  const counter = tripCounter({ capacity: trip.capacity, bookings: rows.map((r) => ({ ready: r.ready })) });
  return { trip, rows, counter };
}

/** Returns Arabic warning text if the pilgrim is already booked on a trip whose dates truly overlap. */
export async function overlapWarning(pilgrimId: string, trip: { id: string; departDate: Date | null; returnDate: Date | null }) {
  const others = await db.booking.findMany({
    where: { pilgrimId, tripId: { not: trip.id }, status: "ACTIVE", deletedAt: null, trip: { deletedAt: null, status: { not: "CANCELLED" } } },
    include: { trip: true },
  });
  const o = others.find((x) => tripsOverlap(trip, x.trip));
  return o ? `المعتمر محجوز في الرحلة ${tripLabel(o.trip)} بتواريخ متداخلة` : null;
}

export function canSeeTrip(user: { id: string; role: string }, trip: { supervisorId: string | null }) {
  return user.role !== "SUPERVISOR" || trip.supervisorId === user.id;
}

/** Open trips for pickers: undated trips last; ids in `booked` are shown as already added. */
export async function tripChoices(booked: string[] = []) {
  const trips = await db.trip.findMany({
    where: { deletedAt: null, status: { not: "CANCELLED" } },
    orderBy: [{ departDate: { sort: "desc", nulls: "last" } }, { name: "asc" }],
  });
  return trips.map((t) => ({ id: t.id, label: tripLabel(t), dates: dateRangeLabel(t.departDate, t.returnDate), booked: booked.includes(t.id), makkahHotelId: t.makkahHotelId ?? "", madinahHotelId: t.madinahHotelId ?? "" }));
}

/** Hotels for the accommodation pickers. */
export async function hotelOptions() {
  const hotels = await db.hotel.findMany({ where: { deletedAt: null }, orderBy: { officialName: "asc" } });
  return hotels.map((h) => ({ id: h.id, name: h.localName ?? h.officialName, city: h.city as "MAKKAH" | "MADINAH" }));
}
