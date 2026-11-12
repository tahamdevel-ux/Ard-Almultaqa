import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { auditChanges } from "./audit";
import { computePrice, noHousingError, type RoomKind } from "@/domain/pricing";
import { paidTotal } from "@/domain/money";

type Tx = Prisma.TransactionClient;
export const ROOM_KINDS: RoomKind[] = ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "QUINT"];

/** Map "tripId:agentId" -> fixed commission override for those trips. */
export async function commissionOverrides(tripIds: string[]) {
  const rows = await db.tripAgentCommission.findMany({ where: { tripId: { in: [...new Set(tripIds)] } } });
  return new Map(rows.map((r) => [`${r.tripId}:${r.agentId}`, r.amount]));
}

export async function loadTripHotels(tripId: string, client: Tx | typeof db = db) {
  return client.tripHotel.findMany({ where: { tripId }, include: { hotel: true, prices: true }, orderBy: { hotel: { officialName: "asc" } } });
}

export interface TripHotelInput { hotelId: string; noHousingPrice: number | null; prices: Partial<Record<RoomKind, number>> }

/** Replaces the trip's priced Makkah hotels. A hotel with bookings on it can't be removed. Optionally re-prices existing bookings. */
export async function saveTripHotels(user: SessionUser, tripId: string, input: TripHotelInput[], applyToExisting: boolean): Promise<{ ok: true; repriced: number } | { ok: false; error: string }> {
  const ids = input.map((i) => i.hotelId);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "فندق مكرر" };
  for (const i of input) {
    if (i.noHousingPrice != null && (!Number.isInteger(i.noHousingPrice) || i.noHousingPrice < 0)) return { ok: false, error: "سعر غير صحيح" };
    for (const v of Object.values(i.prices)) if (!Number.isInteger(v) || (v as number) < 0) return { ok: false, error: "سعر غير صحيح" };
  }
  return db.$transaction(async (tx) => {
    const before = await loadTripHotels(tripId, tx);
    for (const old of before) {
      if (ids.includes(old.hotelId)) continue;
      const used = await tx.booking.count({ where: { tripHotelId: old.id, deletedAt: null } });
      if (used) return { ok: false, error: `لا يمكن حذف فندق عليه ${used} معتمر` } as const;
      await tx.tripHotel.delete({ where: { id: old.id } });
    }
    for (const i of input) {
      const th = await tx.tripHotel.upsert({ where: { tripId_hotelId: { tripId, hotelId: i.hotelId } }, create: { tripId, hotelId: i.hotelId, noHousingPrice: i.noHousingPrice }, update: { noHousingPrice: i.noHousingPrice } });
      for (const k of ROOM_KINDS) {
        const v = i.prices[k];
        if (v == null) await tx.tripHotelPrice.deleteMany({ where: { tripHotelId: th.id, roomType: k } });
        else await tx.tripHotelPrice.upsert({ where: { tripHotelId_roomType: { tripHotelId: th.id, roomType: k } }, create: { tripHotelId: th.id, roomType: k, amount: v }, update: { amount: v } });
      }
    }
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, entity: "TripHotels", entityId: tripId, field: "prices", oldValue: JSON.stringify(before.map((h) => ({ hotelId: h.hotelId, noHousing: h.noHousingPrice, prices: Object.fromEntries(h.prices.map((p) => [p.roomType, p.amount])) }))), newValue: JSON.stringify({ hotels: input, applyToExisting }) } });
    let repriced = 0;
    if (applyToExisting) {
      const bookings = await tx.booking.findMany({ where: { tripId, status: "ACTIVE", deletedAt: null, tripHotelId: { not: null } }, include: { payments: { select: { id: true } } } });
      for (const b of bookings) {
        const r = await repriceBooking(tx, user, b.id);
        if (r) repriced++;
      }
    }
    return { ok: true, repriced } as const;
  });
}

/** Recomputes a booking's price from its hotel, room type, بدون سكن and تصريف. Returns true when the price changed. */
export async function repriceBooking(tx: Tx, user: SessionUser, bookingId: string): Promise<boolean> {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { trip: true, payments: true, tripHotel: { include: { prices: true } } } });
  if (!b.tripHotel || b.priceManual) return false;
  const table = { prices: Object.fromEntries(b.tripHotel.prices.map((p) => [p.roomType, p.amount])), noHousingPrice: b.tripHotel.noHousingPrice };
  const r = computePrice({ table, roomType: (b.roomType as RoomKind) ?? null, noHousing: b.noHousing, sarfByPilgrim: b.sarfByPilgrim, sarfAmount: b.trip.sarfAmount });
  if (!r.ok || r.amount === b.priceAmount) return false;
  // never push the price below what was already received (it would show as overpaid); staff fix those by hand with a refund
  if (r.amount < paidTotal(b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))) - 0.005) return false;
  const after = await tx.booking.update({ where: { id: bookingId }, data: { priceAmount: r.amount, sarfAmount: r.sarf, priceCurrency: "USD" } });
  await auditChanges(tx, user, "Booking", bookingId, b, after, ["priceAmount", "sarfAmount"] as never);
  return true;
}

/** Validates "بدون سكن": his head of family is on the same trip and the same Makkah hotel. */
export async function checkNoHousing(tx: Tx, tripId: string, bookingId: string, tripHotelId: string | null): Promise<string | null> {
  const mine = await tx.bookingGroupMember.findFirst({ where: { bookingId, group: { kind: "FAMILY" } }, include: { group: true } });
  if (!mine) return noHousingError({ hasHead: false, headBookingHotelId: null, hotelId: tripHotelId });
  const head = await tx.bookingGroupMember.findFirst({ where: { groupId: mine.groupId, isHead: true }, include: { booking: true } });
  return noHousingError({ hasHead: !!head && head.bookingId !== bookingId, headBookingHotelId: head?.booking.tripHotelId, hotelId: tripHotelId });
}

export interface PriceAudit { total: number; noPrice: number; differs: number; manual: number }

/** What is wrong with the prices of a trip: bookings without a price, bookings whose price differs from the hotel table, hand-typed prices. */
export async function auditTripPrices(tripId: string): Promise<PriceAudit> {
  const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId } });
  const hotels = await db.tripHotel.findMany({ where: { tripId }, include: { prices: true } });
  const bookings = await db.booking.findMany({ where: { tripId, status: "ACTIVE", deletedAt: null } });
  const a: PriceAudit = { total: bookings.length, noPrice: 0, differs: 0, manual: 0 };
  for (const b of bookings) {
    if (b.priceManual) a.manual++;
    if (b.priceAmount == null) { a.noPrice++; continue; }
    const th = hotels.find((h) => h.id === b.tripHotelId);
    if (!th || b.priceManual) continue;
    const r = computePrice({ table: { prices: Object.fromEntries(th.prices.map((p) => [p.roomType, p.amount])), noHousingPrice: th.noHousingPrice }, roomType: (b.roomType as RoomKind) ?? null, noHousing: b.noHousing, sarfByPilgrim: b.sarfByPilgrim, sarfAmount: trip.sarfAmount });
    if (r.ok && r.amount !== b.priceAmount) a.differs++;
  }
  return a;
}

/**
 * Recalculates every non-manual booking of the trip from its priced hotel + room type (+ تصريف المعتمر). A booking with no hotel gets the
 * trip's only priced hotel when there is exactly one. Hand-typed prices are never touched. Returns what it did and what it could not do.
 */
export async function recalcTripPrices(user: SessionUser, tripId: string) {
  return db.$transaction(async (tx) => {
    const hotels = await tx.tripHotel.findMany({ where: { tripId } });
    const bookings = await tx.booking.findMany({ where: { tripId, status: "ACTIVE", deletedAt: null } });
    const out = { updated: 0, unchanged: 0, skippedManual: 0, noHotel: 0, noRoomType: 0, noTablePrice: 0 };
    for (const b of bookings) {
      if (b.priceManual) { out.skippedManual++; continue; }
      let thId = b.tripHotelId;
      if (!thId && hotels.length === 1) { thId = hotels[0].id; await tx.booking.update({ where: { id: b.id }, data: { tripHotelId: thId } }); }
      if (!thId) { out.noHotel++; continue; }
      if (!b.noHousing && !b.roomType) { out.noRoomType++; continue; }
      const before = b.priceAmount;
      const changed = await repriceBooking(tx, user, b.id);
      const after = (await tx.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount;
      if (changed) out.updated++;
      else if (after == null || before == null) out.noTablePrice++;
      else out.unchanged++;
    }
    return out;
  });
}
