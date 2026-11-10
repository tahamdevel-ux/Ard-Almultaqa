import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { fullNameAr, fullNameEn, tripleNameAr } from "@/server/pilgrims";
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

/** Hotel rooming list: built from the office rooms, shows the HOTEL's own room number (blank when not entered) and never the office label. `tripHotelId` picks one Makkah hotel; Madinah has the trip's fixed hotel. */
export async function roomingData(tripId: string, city: "MAKKAH" | "MADINAH", tripHotelId?: string) {
  const [company, trip] = await Promise.all([
    getSetting("company"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { madinahHotel: true } }),
  ]);
  const th = city === "MAKKAH" && tripHotelId ? await db.tripHotel.findFirst({ where: { id: tripHotelId, tripId }, include: { hotel: true } }) : null;
  const hotel = city === "MAKKAH" ? th?.hotel ?? null : trip.madinahHotel;
  const stay = stayDates(trip.departDate, trip.firstCity, trip.nightsMakkah, trip.nightsMadinah).find((s) => s.city === city)!;
  const rooms = await db.officeRoom.findMany({
    where: { tripId, ...(city === "MAKKAH" && tripHotelId ? { tripHotelId } : {}) },
    include: { members: { include: { booking: { include: { pilgrim: true } } } } },
  });
  const no = (r: (typeof rooms)[number]) => (city === "MAKKAH" ? r.makkahHotelRoomNo : r.madinahHotelRoomNo) ?? "";
  rooms.sort((a, b) => (no(a) === "" ? 1 : 0) - (no(b) === "" ? 1 : 0) || no(a).localeCompare(no(b), undefined, { numeric: true }) || a.seq - b.seq);
  const rows: { roomNo: string; typeAr: string; typeEn: string; nameAr: string; nameEn: string; passportNo: string; gender: string }[] = [];
  for (const r of rooms) for (const a of r.members) {
    if (a.booking.noHousing) continue; // no bed, not on the hotel's list
    const p = a.booking.pilgrim;
    rows.push({ roomNo: no(r), typeAr: r.roomType ? ROOM_TYPE_LABELS[r.roomType] : "", typeEn: r.roomType ? ROOM_EN[r.roomType] : "", nameAr: tripleNameAr(p), nameEn: fullNameEn(p), passportNo: p.passportNo, gender: p.gender === "MALE" ? "M" : "F" });
  }
  return {
    company, trip, hotel, rows, cityAr: CITY_AR[city], cityEn: CITY_EN[city],
    checkIn: formatDate(stay.checkIn), checkOut: formatDate(stay.checkOut),
    hotelAr: hotel ? hotel.localName ? `${hotel.localName} (${hotel.officialName})` : hotel.officialName : "—",
    hotelEn: hotel?.officialName ?? "—",
  };
}

import { agentStatement, formatMoney, paidTotal } from "@/domain/money";
import { resolveCommission } from "@/domain/pricing";
import { commissionOverrides } from "@/server/tripHotels";

export async function agentStatementData(agentId: string, tripId?: string) {
  const [company, agent] = await Promise.all([getSetting("company"), db.agent.findFirstOrThrow({ where: { id: agentId, deletedAt: null }, omit: { roomCode: true } }) /* office room data never goes into an output */]);
  const bookings = await db.booking.findMany({
    where: { agentId, deletedAt: null, status: { in: ["ACTIVE", "CANCELLED"] }, ...(tripId ? { tripId } : {}) },
    include: { pilgrim: true, trip: true, payments: true }, orderBy: [{ trip: { createdAt: "desc" } }, { tripId: "desc" }, { createdAt: "asc" }],
  });
  const rows = bookings.map((b) => {
    const paid = paidTotal(b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) })));
    return { b, paid, price: b.priceAmount, cancelled: b.status === "CANCELLED" };
  });
  const overrides = await commissionOverrides(bookings.map((b) => b.tripId));
  const sum = agentStatement(rows.map((r) => ({ price: r.price, paid: r.paid, cancelled: r.cancelled, fixed: resolveCommission(overrides.get(`${r.b.tripId}:${agentId}`), r.b.trip.agentCommission) })), { type: "FIXED_PER_PILGRIM", value: 0 });
  return { company, agent, rows, sum, currency: "USD" as const };
}

export const money = formatMoney;

const pad = (n: number) => String(n).padStart(2, "0");

/** Everything the Hay'a land manifest of one bus needs. */
export async function hayaData(tripId: string, busId: string) {
  const [company, haya, trip, bus] = await Promise.all([
    getSetting("company"), getSetting("haya"),
    db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { madinahHotel: true } }),
    db.bus.findFirstOrThrow({ where: { id: busId, tripId } }),
  ]);
  const seats = await db.seatAssignment.findMany({
    where: { busId, booking: { status: "ACTIVE", deletedAt: null } },
    include: { booking: { include: { pilgrim: true, tripHotel: { include: { hotel: true } } } } },
    orderBy: { seatNo: "asc" },
  });
  const people = seats.map((s) => {
    const p = s.booking.pilgrim, r = s.booking.tripRole;
    return {
      role: (r === "CONTRACTOR" ? "contractor" : r === "DRIVER" ? "driver" : r === "ASSISTANT" ? "assistant" : "pilgrim") as "contractor" | "driver" | "assistant" | "pilgrim",
      nameAr: fullNameAr(p), mother: p.motherName ?? "", birth: `${p.birthDate.getUTCFullYear()}/${pad(p.birthDate.getUTCMonth() + 1)}/${pad(p.birthDate.getUTCDate())}`,
      passport: p.passportNo, firstNameEn: p.enGivenName, phone: p.phone, birthDate: p.birthDate,
    };
  });
  const hotelName = (h?: { localName: string | null; officialName: string } | null) => (h ? h.localName ?? h.officialName : "");
  const makkah = [...new Set(seats.map((s) => hotelName(s.booking.tripHotel?.hotel)).filter(Boolean))].join(" / ");
  const d = trip.departDate;
  return {
    people, departOn: d, trip, bus,
    header: {
      company: company.name, subCompany: haya.subCompany, transportCompany: trip.transportCompany ?? bus.company ?? "", madinahHotel: hotelName(trip.madinahHotel), makkahHotel: makkah,
      busNumber: bus.number, departureGovernorate: trip.departGovernorate ?? "", departureDate: d ? `${d.getUTCDate()}-${d.getUTCMonth() + 1}-${d.getUTCFullYear()}` : "",
      route: trip.routeText ?? "", sequence: trip.sequenceNo ?? "",
    },
  };
}
