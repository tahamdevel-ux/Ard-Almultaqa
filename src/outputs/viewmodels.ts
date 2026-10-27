import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";

export async function manifestData(tripId: string, busId: string) {
  const [company, trip, bus] = await Promise.all([
    getSetting("company"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null } }),
    db.bus.findFirstOrThrow({ where: { id: busId, tripId } }),
  ]);
  const seats = await db.seatAssignment.findMany({
    where: { busId, booking: { status: "ACTIVE", deletedAt: null } },
    include: { booking: { include: { pilgrim: true } } },
    orderBy: { seatNo: "asc" },
  });
  const rows = seats.map((s) => ({
    seat: s.seatNo!, nameAr: fullNameAr(s.booking.pilgrim), nameEn: fullNameEn(s.booking.pilgrim),
    passportNo: s.booking.pilgrim.passportNo, visaNo: s.booking.visaNo ?? "",
  }));
  return { company, trip, bus, rows, title: `كشف الباص رقم ${bus.number}`, meta: `الرحلة ${trip.tripNo} — ${formatDate(trip.departDate)}` };
}

export async function flightListData(tripId: string) {
  const [company, trip] = await Promise.all([
    getSetting("company"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { flights: true } }),
  ]);
  const bookings = await db.booking.findMany({
    where: { tripId, status: "ACTIVE", deletedAt: null },
    include: { pilgrim: true, seat: { include: { car: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = bookings.map((b, i) => ({
    n: i + 1, nameEn: fullNameEn(b.pilgrim), nameAr: fullNameAr(b.pilgrim), passportNo: b.pilgrim.passportNo,
    ticketNo: b.seat?.ticketNo ?? "", car: b.seat?.car?.label ?? "",
  }));
  const f = trip.flights[0];
  return { company, trip, rows, title: "قائمة ركاب الطيران", meta: `الرحلة ${trip.tripNo}${f ? ` — ${f.flightNo} ${f.airline ?? ""}` : ""} — ${formatDate(trip.departDate)}` };
}
