/** Pure pricing rules for the Makkah-hotel price table (USD, cents allowed). */
import { round2 } from "./money";
export type RoomKind = "SINGLE" | "DOUBLE" | "TRIPLE" | "QUAD" | "QUINT";

export interface HotelPriceTable { prices: Partial<Record<RoomKind, number>>; noHousingPrice: number | null }

export interface PriceInput {
  table: HotelPriceTable | null; // the pilgrim's priced Makkah hotel on this trip
  roomType: RoomKind | null;
  noHousing: boolean;
  sarfByPilgrim: boolean; // air: تصريف المعتمر
  sarfAmount: number | null; // the trip's تصريف amount
}

export type PriceResult = { ok: true; amount: number; sarf: number } | { ok: false; error: string };

/**
 * Price of one pilgrim = the hotel price of his room type (or the hotel's "بدون سكن" price) + تصريف when the pilgrim pays it.
 * The Madinah hotel and the food option never change the price.
 */
export function computePrice(i: PriceInput): PriceResult {
  if (!i.table) return { ok: false, error: "اختر فندق مكة المسعّر" };
  let base: number | undefined;
  if (i.noHousing) {
    if (i.table.noHousingPrice == null) return { ok: false, error: "سعر «بدون سكن» غير محدد لهذا الفندق" };
    base = i.table.noHousingPrice;
  } else {
    if (!i.roomType) return { ok: false, error: "اختر نوع الغرفة" };
    base = i.table.prices[i.roomType];
    if (base == null) return { ok: false, error: "لا يوجد سعر لهذا النوع في هذا الفندق" };
  }
  const sarf = i.sarfByPilgrim ? Math.max(0, round2(i.sarfAmount ?? 0)) : 0;
  return { ok: true, amount: round2(base + sarf), sarf };
}

/** Fixed agent commission per pilgrim: the agent's amount on the trip, else the trip's amount, else 0 (غير محدد). */
export function resolveCommission(agentOverride: number | null | undefined, tripDefault: number | null | undefined): number {
  return agentOverride ?? tripDefault ?? 0;
}

/** "بدون سكن" needs a head of family on the same trip and the same Makkah hotel. */
export function noHousingError(opts: { headBookingHotelId: string | null | undefined; hotelId: string | null | undefined; hasHead: boolean }): string | null {
  if (!opts.hasHead) return "«بدون سكن» يحتاج ربّ أسرة في نفس الرحلة";
  if (opts.headBookingHotelId !== opts.hotelId) return "ربّ الأسرة في فندق آخر";
  return null;
}
