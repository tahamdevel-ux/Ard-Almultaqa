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

import { stayDates, ROOM_TYPE_LABELS } from "@/domain/rooming";
import { readiness } from "@/domain/readiness";
import { passportExpiryWarning } from "@/domain/passport";

const CITY_AR = { MAKKAH: "مكة المكرمة", MADINAH: "المدينة المنورة" } as const;
const CITY_EN = { MAKKAH: "Makkah", MADINAH: "Madinah" } as const;
const ROOM_EN = { DOUBLE: "Double", TRIPLE: "Triple", QUAD: "Quad", QUINT: "Quint" } as const;

export async function roomingData(tripId: string, city: "MAKKAH" | "MADINAH") {
  const [company, trip] = await Promise.all([
    getSetting("company"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { makkahHotel: true, madinahHotel: true } }),
  ]);
  const hotel = city === "MAKKAH" ? trip.makkahHotel : trip.madinahHotel;
  const stay = stayDates(trip.departDate, trip.firstCity, trip.nightsMakkah, trip.nightsMadinah).find((s) => s.city === city)!;
  const rooms = await db.room.findMany({
    where: { tripId, city },
    include: { assignments: { include: { booking: { include: { pilgrim: true } } } } },
  });
  rooms.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
  const rows: { roomNo: string; typeAr: string; typeEn: string; nameAr: string; nameEn: string; passportNo: string; gender: string }[] = [];
  for (const r of rooms) for (const a of r.assignments) {
    const p = a.booking.pilgrim;
    rows.push({ roomNo: r.roomNo, typeAr: ROOM_TYPE_LABELS[r.type], typeEn: ROOM_EN[r.type], nameAr: fullNameAr(p), nameEn: fullNameEn(p), passportNo: p.passportNo, gender: p.gender === "MALE" ? "M" : "F" });
  }
  return {
    company, trip, hotel, rows, cityAr: CITY_AR[city], cityEn: CITY_EN[city],
    checkIn: formatDate(stay.checkIn), checkOut: formatDate(stay.checkOut),
    hotelAr: hotel ? hotel.localName ? `${hotel.localName} (${hotel.officialName})` : hotel.officialName : "—",
    hotelEn: hotel?.officialName ?? "—",
  };
}

export async function missingData(tripId: string) {
  const [company, trip, minMonths] = await Promise.all([
    getSetting("company"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null } }),
    getSetting("passportMinMonths"),
  ]);
  const bookings = await db.booking.findMany({
    where: { tripId, status: "ACTIVE", deletedAt: null },
    include: { pilgrim: { include: { documents: { select: { type: true } } } } }, orderBy: { createdAt: "asc" },
  });
  const rows = bookings.map((b) => {
    const { missing, ready } = readiness({ bookingActive: true, docs: b.pilgrim.documents.map((d) => d.type), visaStatus: b.visaStatus });
    const items = [...missing];
    const w = passportExpiryWarning(b.pilgrim.passportExpiry, trip.returnDate, minMonths);
    if (w) items.push(w);
    return { nameAr: fullNameAr(b.pilgrim), passportNo: b.pilgrim.passportNo, phone: b.pilgrim.phone ?? "", ready, items };
  }).filter((r) => r.items.length);
  return { company, trip, rows, title: "قائمة النواقص", meta: `الرحلة ${trip.tripNo} — ${formatDate(trip.departDate)}`, total: bookings.length };
}

export async function idCardData(tripId: string) {
  const [company, trip] = await Promise.all([
    getSetting("company"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { makkahHotel: true, madinahHotel: true, supervisor: true } }),
  ]);
  const bookings = await db.booking.findMany({
    where: { tripId, status: "ACTIVE", deletedAt: null },
    include: { pilgrim: { include: { documents: { where: { type: "PHOTO" } } } } }, orderBy: { createdAt: "asc" },
  });
  return { company, trip, bookings };
}
