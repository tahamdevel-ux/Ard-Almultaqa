import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { withTripLock } from "./buses";
import { placeInRoomByLabel } from "@/officeRooms/service";
import { canPlace, ROOM_BEDS, type Occupant } from "@/domain/rooming";

type Tx = Prisma.TransactionClient;
type City = "MAKKAH" | "MADINAH";
export type Accommodation = {
  makkahHotelId?: string | null; madinahHotelId?: string | null; roomType?: string | null;
  makkahRoomNo?: string; madinahRoomNo?: string;
  /** internal office room label (a1 / 2): empty = automatic */
  officeRoom?: string;
};
export type AccResult = { ok: true } | { ok: false; error: string };

const CITY_LABEL: Record<City, string> = { MAKKAH: "مكة", MADINAH: "المدينة" };

/** Per-trip accommodation inside one form: field names carry the trip id (e.g. makkahRoomNo__<tripId>). */
export function accommodationForTrip(f: FormData, tripId: string): Accommodation | undefined {
  const g = (k: string) => String(f.get(`${k}__${tripId}`) ?? "").trim();
  const a: Accommodation = { makkahHotelId: g("makkahHotelId") || null, madinahHotelId: g("madinahHotelId") || null, roomType: g("roomType") || null, makkahRoomNo: g("makkahRoomNo"), madinahRoomNo: g("madinahRoomNo"), officeRoom: g("officeRoom") };
  return a.roomType || a.makkahRoomNo || a.madinahRoomNo || a.officeRoom ? a : undefined; // hotels alone (= the defaults) need no extra work
}

export class AccommodationError extends Error {}

/** Read the accommodation fields out of a form (names: makkahHotelId, madinahHotelId, roomType, makkahRoomNo, madinahRoomNo). */
export function accommodationFromForm(f: FormData): Accommodation {
  const g = (k: string) => String(f.get(k) ?? "").trim();
  return { makkahHotelId: g("makkahHotelId") || null, madinahHotelId: g("madinahHotelId") || null, roomType: g("roomType") || null, makkahRoomNo: g("makkahRoomNo"), madinahRoomNo: g("madinahRoomNo"), officeRoom: g("officeRoom") };
}

async function placeInRoom(tx: Tx, tripId: string, bookingId: string, city: City, hotelId: string | null, roomType: string | null, roomNo: string): Promise<string | null> {
  if (!roomNo) { await tx.roomAssignment.deleteMany({ where: { bookingId, city } }); return null; }
  if (!hotelId) return `اختر فندق ${CITY_LABEL[city]} قبل كتابة رقم الغرفة`;
  let room = await tx.room.findUnique({ where: { tripId_city_roomNo: { tripId, city, roomNo } } });
  if (room) {
    if (room.hotelId !== hotelId) return `الغرفة ${roomNo} في ${CITY_LABEL[city]} مسجّلة في فندق آخر`;
    if (roomType && room.type !== roomType) return `الغرفة ${roomNo} من نوع آخر (${room.type})`;
  } else {
    if (!roomType || !(roomType in ROOM_BEDS)) return "اختر نوع الغرفة لإنشاء غرفة جديدة";
    room = await tx.room.create({ data: { tripId, city, hotelId, roomNo, type: roomType as keyof typeof ROOM_BEDS, beds: ROOM_BEDS[roomType as keyof typeof ROOM_BEDS] } });
  }
  const full = await tx.room.findUniqueOrThrow({ where: { id: room.id }, include: { assignments: { include: { booking: { include: { pilgrim: { select: { gender: true } }, groups: true } } } } } });
  const me = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { pilgrim: { select: { gender: true } }, groups: true } });
  const occ: Occupant = { bookingId, gender: me.pilgrim.gender, groupIds: me.groups.map((g) => g.groupId) };
  const err = canPlace({
    id: full.id, roomNo: full.roomNo, beds: full.beds,
    occupants: full.assignments.map((a): Occupant => ({ bookingId: a.bookingId, gender: a.booking.pilgrim.gender, groupIds: a.booking.groups.map((g) => g.groupId) })),
  }, occ);
  if (err) return `غرفة ${roomNo}: ${err}`;
  await tx.roomAssignment.upsert({ where: { bookingId_city: { bookingId, city } }, create: { roomId: room.id, bookingId, city }, update: { roomId: room.id } });
  return null;
}

/**
 * Sets a pilgrim's own hotels, room type and rooms on one trip. Empty room number = not housed in that city yet.
 * The room type also sets the booking's price from the trip's price list when the booking has none.
 * All-or-nothing: any problem (room full, wrong gender mix, room in another hotel) changes nothing.
 */
export async function applyAccommodation(tripId: string, bookingId: string, a: Accommodation, client: Tx | typeof db = db): Promise<AccResult> {
  return withTripLock(client, tripId, async (tx) => {
    const b = await tx.booking.findFirst({ where: { id: bookingId, tripId, status: "ACTIVE", deletedAt: null } });
    if (!b) return { ok: false, error: "الحجز غير موجود" } as AccResult;
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId } });
    const mk = a.makkahHotelId || trip.makkahHotelId, md = a.madinahHotelId || trip.madinahHotelId;
    const data: Prisma.BookingUncheckedUpdateInput = { makkahHotelId: a.makkahHotelId || null, madinahHotelId: a.madinahHotelId || null };
    if (a.roomType) {
      data.roomType = a.roomType;
      if (b.priceAmount == null) {
        const price = await tx.tripPrice.findFirst({ where: { tripId, roomType: a.roomType as never } });
        if (price) { data.priceAmount = price.amount; data.priceCurrency = price.currency; }
      }
    }
    await tx.booking.update({ where: { id: bookingId }, data });
    for (const [city, hotelId, no] of [["MAKKAH", mk, a.makkahRoomNo ?? ""], ["MADINAH", md, a.madinahRoomNo ?? ""]] as const) {
      const err = await placeInRoom(tx, tripId, bookingId, city, hotelId, a.roomType ?? b.roomType ?? null, no);
      if (err) throw new RollbackError(err);
    }
    if (a.officeRoom) {
      const r = await placeInRoomByLabel(tx, tripId, bookingId, a.officeRoom);
      if (!r.ok) throw new RollbackError(r.error);
    }
    return { ok: true } as AccResult;
  }).catch((e) => { if (e instanceof RollbackError) return { ok: false, error: e.message } as AccResult; throw e; });
}

class RollbackError extends Error {}
