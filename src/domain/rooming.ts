export type RoomTypeKey = "DOUBLE" | "TRIPLE" | "QUAD" | "QUINT";
export const ROOM_BEDS: Record<RoomTypeKey, number> = { DOUBLE: 2, TRIPLE: 3, QUAD: 4, QUINT: 5 };
export const ROOM_TYPE_LABELS: Record<RoomTypeKey, string> = { DOUBLE: "ثنائية", TRIPLE: "ثلاثية", QUAD: "رباعية", QUINT: "خماسية" };

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

export interface AutoResult {
  assignments: Map<string, string>; // bookingId -> roomId
  unplaced: string[];
  splitGroups: string[]; // groups that could not fit one room and were spread over rooms
}

/**
 * Suggests rooms for `people` (not yet housed). Groups (family / companions) stay together in
 * one room when one is big enough, otherwise they are spread over consecutive rooms.
 * Never exceeds beds; never mixes genders outside a shared group.
 */
export function autoAssignRooms(rooms: RoomState[], people: Occupant[]): AutoResult {
  const state = rooms.map((r) => ({ ...r, occupants: [...r.occupants] }));
  const assignments = new Map<string, string>();
  const unplaced: string[] = [];
  const splitGroups: string[] = [];
  const place = (room: RoomState, p: Occupant) => { room.occupants.push(p); assignments.set(p.bookingId, room.id); };
  const free = (r: RoomState) => r.beds - r.occupants.length;
  const genderOf = (r: RoomState) => (r.occupants.length ? r.occupants[0].gender : null);

  const groups = new Map<string, Occupant[]>();
  const singles: Occupant[] = [];
  for (const p of people) {
    const g = p.groupIds[0];
    if (g) groups.set(g, [...(groups.get(g) ?? []), p]); else singles.push(p);
  }

  for (const [gid, members] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    // a room already holding group members (e.g. partially housed family) is preferred
    const holding = state.find((r) => r.occupants.some((o) => o.groupIds.includes(gid)) && free(r) >= members.length);
    const fit = holding ?? state
      .filter((r) => free(r) >= members.length && members.every((m) => canPlace(r, m) === null))
      .sort((a, b) => free(a) - members.length - (free(b) - members.length) || a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }))[0];
    if (fit) { members.forEach((m) => place(fit, m)); continue; }
    // spread over consecutive rooms
    const sorted = [...state].sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
    let split = false;
    for (const m of members) {
      const r = sorted.find((x) => canPlace(x, m) === null);
      if (r) { place(r, m); split = true; } else unplaced.push(m.bookingId);
    }
    if (split) splitGroups.push(gid);
  }

  const bySex = (g: Gender) => singles.filter((s) => s.gender === g);
  for (const g of ["FEMALE", "MALE"] as Gender[]) {
    for (const p of bySex(g)) {
      const partial = state.find((r) => genderOf(r) === g && free(r) > 0 && canPlace(r, p) === null);
      const empty = state.filter((r) => r.occupants.length === 0).sort((a, b) => b.beds - a.beds || a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }))[0];
      const r = partial ?? empty;
      if (r) place(r, p); else unplaced.push(p.bookingId);
    }
  }
  return { assignments, unplaced, splitGroups };
}

export interface StayDates { city: "MAKKAH" | "MADINAH"; checkIn: Date; checkOut: Date }

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Check-in / check-out per city, from departure date, nights and which city comes first. */
export function stayDates(depart: Date, firstCity: "MAKKAH" | "MADINAH", nightsMakkah: number, nightsMadinah: number): StayDates[] {
  const second = firstCity === "MAKKAH" ? "MADINAH" : "MAKKAH";
  const n1 = firstCity === "MAKKAH" ? nightsMakkah : nightsMadinah;
  const n2 = second === "MAKKAH" ? nightsMakkah : nightsMadinah;
  return [
    { city: firstCity, checkIn: depart, checkOut: addDays(depart, n1) },
    { city: second, checkIn: addDays(depart, n1), checkOut: addDays(depart, n1 + n2) },
  ];
}
