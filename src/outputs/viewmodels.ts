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
    passportNo: s.booking.pilgrim.passportNo,
  }));
  return { company, trip, bus, rows, title: `كشف الباص رقم ${bus.number}${bus.name ? ` — ${bus.name}` : ""}`, meta: joinMeta(tripMetaParts(trip)) };
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
  return { company, trip, rows, title: "قائمة ركاب الطيران", meta: joinMeta([...tripMetaParts(trip).slice(0, 1), f ? `${f.flightNo} ${f.airline ?? ""}`.trim() : null, ...tripMetaParts(trip).slice(1)]) };
}

import { stayDates, ROOM_TYPE_LABELS } from "@/domain/rooming";
import { joinMeta, tripMetaParts } from "./meta";
import { readiness } from "@/domain/readiness";
import { passportExpiryWarning } from "@/domain/passport";

const CITY_AR = { MAKKAH: "مكة المكرمة", MADINAH: "المدينة المنورة" } as const;
const CITY_EN = { MAKKAH: "Makkah", MADINAH: "Madinah" } as const;
const ROOM_EN = { SINGLE: "Single", DOUBLE: "Double", TRIPLE: "Triple", QUAD: "Quad", QUINT: "Quint" } as const;

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

import { agentStatement, formatMoney, paidTotal } from "@/domain/money";

export async function agentStatementData(agentId: string, tripId?: string) {
  const [company, agent] = await Promise.all([getSetting("company"), db.agent.findFirstOrThrow({ where: { id: agentId, deletedAt: null } })]);
  const bookings = await db.booking.findMany({
    where: { agentId, deletedAt: null, status: { in: ["ACTIVE", "CANCELLED"] }, ...(tripId ? { tripId } : {}) },
    include: { pilgrim: true, trip: true, payments: true }, orderBy: [{ trip: { createdAt: "desc" } }, { tripId: "desc" }, { createdAt: "asc" }],
  });
  const rows = bookings.map((b) => {
    const paid = paidTotal(b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) })));
    return { b, paid, price: b.priceAmount, cancelled: b.status === "CANCELLED" };
  });
  const sum = agentStatement(rows.map((r) => ({ price: r.price, paid: r.paid, cancelled: r.cancelled })), { type: agent.commissionType, value: Number(agent.commissionValue) });
  return { company, agent, rows, sum, currency: "USD" as const };
}

export const money = formatMoney;
