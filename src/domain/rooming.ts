export type RoomTypeKey = "SINGLE" | "DOUBLE" | "TRIPLE" | "QUAD" | "QUINT";
export const ROOM_BEDS: Record<RoomTypeKey, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4, QUINT: 5 };
export const ROOM_TYPE_LABELS: Record<RoomTypeKey, string> = { SINGLE: "سنكل", DOUBLE: "ثنائية", TRIPLE: "ثلاثية", QUAD: "رباعية", QUINT: "خماسية" };

export type Gender = "MALE" | "FEMALE";

export interface Occupant { bookingId: string; gender: Gender; groupIds: string[] }
export interface RoomState { id: string; roomNo: string; beds: number; occupants: Occupant[] }

const sharesGroup = (a: Occupant, b: Occupant) => a.groupIds.some((g) => b.groupIds.includes(g));

/** Returns an Arabic error if `p` may not be placed in `room`, else null. */
export function canPlace(room: RoomState, p: Occupant): string | null {
  const others = room.occupants.filter((o) => o.bookingId !== p.bookingId);
  if (others.length >= room.beds) return "الغرفة ممتلئة";
  const bad = others.find((o) => o.gender !== p.gender && !sharesGroup(o, p));
  if (bad) return "لا يجوز خلط الرجال والنساء في غرفة واحدة إلا لأفراد العائلة";
  return null;
}

/** Fraction of beds used, for colouring. */
export function occupancy(room: RoomState): "empty" | "partial" | "full" {
  return room.occupants.length === 0 ? "empty" : room.occupants.length >= room.beds ? "full" : "partial";
}

export interface StayDates { city: "MAKKAH" | "MADINAH"; checkIn: Date | null; checkOut: Date | null }

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Check-in / check-out per city, from departure date, nights and which city comes first. */
export function stayDates(depart: Date | null, firstCity: "MAKKAH" | "MADINAH", nightsMakkah: number, nightsMadinah: number): StayDates[] {
  const second = firstCity === "MAKKAH" ? "MADINAH" : "MAKKAH";
  const n1 = firstCity === "MAKKAH" ? nightsMakkah : nightsMadinah;
  const n2 = second === "MAKKAH" ? nightsMakkah : nightsMadinah;
  if (!depart) return [{ city: firstCity, checkIn: null, checkOut: null }, { city: second, checkIn: null, checkOut: null }];
  return [
    { city: firstCity, checkIn: depart, checkOut: addDays(depart, n1) },
    { city: second, checkIn: addDays(depart, n1), checkOut: addDays(depart, n1 + n2) },
  ];
}
