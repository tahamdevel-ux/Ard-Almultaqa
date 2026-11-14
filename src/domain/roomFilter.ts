import { searchTokens, normalizeSearch } from "./searchNorm";

/** What the rooming screen needs to filter a room: no database types, so it can be tested alone. */
export interface RoomView {
  id: string; label: string; category: "MEN" | "WOMEN" | "FAMILY"; hotelId: string | null;
  capacity: number; housed: number; locked: boolean; warnings: number;
  people: { name: string; passport: string; agent?: string }[];
}
export type RoomStatus = "full" | "incomplete" | "empty";
export interface RoomFilter { q: string; hotel: string; category: "" | "MEN" | "WOMEN" | "FAMILY"; status: "" | RoomStatus | "warning" }

export function roomStatus(r: Pick<RoomView, "capacity" | "housed">): RoomStatus {
  return r.housed === 0 ? "empty" : r.housed >= r.capacity ? "full" : "incomplete";
}

/** Rooms matching the search text (room label, a member's name, passport or agent), the hotel, the category and the status. */
export function filterRooms<T extends RoomView>(rooms: T[], f: RoomFilter): T[] {
  const tokens = searchTokens(f.q);
  return rooms.filter((r) => {
    if (f.hotel && (r.hotelId ?? "none") !== f.hotel) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.status === "warning" ? r.warnings === 0 : f.status && roomStatus(r) !== f.status) return false;
    if (!tokens.length) return true;
    const hay = normalizeSearch([r.label, ...r.people.flatMap((p) => [p.name, p.passport, p.agent ?? ""])].join(" "));
    return tokens.every((t) => hay.includes(t));
  });
}

/** Does this pilgrim match the search? (used to highlight him inside a room) */
export function personMatches(p: { name: string; passport: string; agent?: string }, q: string): boolean {
  const tokens = searchTokens(q);
  if (!tokens.length) return false;
  const hay = normalizeSearch([p.name, p.passport, p.agent ?? ""].join(" "));
  return tokens.every((t) => hay.includes(t));
}

/** Why a pilgrim has no room yet, in words the staff understand. */
export function noRoomReason(p: { hasHotel: boolean; hasRoomType: boolean; noHousing: boolean; headHasNoRoom?: boolean }): string {
  if (p.noHousing) return p.headHasNoRoom ? "بدون سكن — رب أسرته بلا غرفة بعد" : "بدون سكن — يدخل غرفة رب أسرته";
  if (!p.hasHotel) return "لم يُحدَّد فندق مكة";
  if (!p.hasRoomType) return "لم يُحدَّد نوع الغرفة";
  return "لم يُوزَّع بعد — اضغط «وزّع المعتمرين»";
}
