import { ROOM_BEDS, type RoomTypeKey } from "./rooming";

/**
 * Office rooms: an internal numbering of rooms per trip, used only by office staff.
 * Completely separate from the hotel rooming board (src/domain/rooming.ts decides hotel rooms).
 */
export type OfficeCategory = "MEN" | "WOMEN" | "FAMILY";
export type Gender = "MALE" | "FEMALE";

export interface OfficePerson {
  bookingId: string;
  gender: Gender;
  /** family / companion (عصبة) group ids the booking belongs to; the first one drives placement */
  groupIds: string[];
  /** true when one of the groups is a FAMILY (not a companion group) */
  inFamily: boolean;
  roomType: RoomTypeKey | null;
  agentId: string | null;
  /** bus the pilgrim rides (land trips only) */
  busId: string | null;
  /** priced Makkah hotel (TripHotel id): only pilgrims of the same hotel share a room */
  hotelId: string | null;
  /** بدون سكن: takes no bed, sits in his head of family's room */
  noHousing: boolean;
}
export interface OfficeMember extends OfficePerson { assignedBy: "AUTO" | "MANUAL" }
export interface OfficeRoomState {
  id: string;
  code: string | null;
  seq: number;
  capacity: number;
  roomType: RoomTypeKey | null;
  category: OfficeCategory;
  locked: boolean;
  hotelId?: string | null;
  members: OfficeMember[];
}
export interface TripContext {
  transport: "LAND" | "AIR";
  /** agent code per agent id (null = the agent has no code) */
  agentCodes: Map<string, string | null>;
  /** land: agent id of a bus that carries only that agent's pilgrims; null/absent = mixed bus */
  busAgent: Map<string, string | null>;
}

export const DEFAULT_OFFICE_CAPACITY = 4;

/** Capacity comes from the room type the pilgrim paid for; without one the default from Settings is used. */
export function capacityFor(roomType: RoomTypeKey | null, defaultCapacity: number = DEFAULT_OFFICE_CAPACITY): number {
  return roomType ? ROOM_BEDS[roomType] : Math.max(1, defaultCapacity);
}

export const roomLabel = (r: { code: string | null; seq: number }) => `${r.code ?? ""}${r.seq}`;

/** Both genders in one room can only happen inside a family/companion group: that is a FAMILY room. */
export function categoryOf(members: OfficePerson[]): OfficeCategory {
  if (members.some((m) => m.gender === "MALE") && members.some((m) => m.gender === "FEMALE")) return "FAMILY";
  if (members.some((m) => m.inFamily)) return "FAMILY";
  return members[0]?.gender === "FEMALE" ? "WOMEN" : "MEN";
}

/** The "segment" keeps agents apart: one agent on air trips, one single-agent bus on land trips, otherwise mixed. */
export function segmentOf(p: OfficePerson, ctx: TripContext): string {
  if (ctx.transport === "AIR") return "agent:" + (p.agentId ?? "-");
  if (p.busId && ctx.busAgent.get(p.busId)) return "bus:" + p.busId;
  return "mixed";
}

/**
 * Agent code a room gets: every member belongs to the same agent, that agent has a code and (land) every member rides
 * a bus that carries only that agent's pilgrims. Otherwise null (a plain number).
 */
export function codeFor(members: OfficePerson[], ctx: TripContext): string | null {
  if (!members.length) return null;
  const agent = members[0].agentId;
  if (!agent || members.some((m) => m.agentId !== agent)) return null;
  const code = ctx.agentCodes.get(agent) ?? null;
  if (!code) return null;
  if (ctx.transport === "LAND" && members.some((m) => !m.busId || ctx.busAgent.get(m.busId) !== agent)) return null;
  return code;
}

export function nextSeq(rooms: { code: string | null; seq: number }[], code: string | null): number {
  return Math.max(0, ...rooms.filter((r) => (r.code ?? "") === (code ?? "")).map((r) => r.seq)) + 1;
}

export interface NewRoomPlan { hotelId: string | null; tempId: string; code: string | null; seq: number; capacity: number; roomType: RoomTypeKey | null; category: OfficeCategory }
export interface Plan {
  /** bookingId -> existing room id, or a tempId of a room in newRooms */
  placements: Map<string, string>;
  newRooms: NewRoomPlan[];
  /** groups bigger than one room, spread over several */
  splitGroups: string[];
}

interface Sim { id: string; code: string | null; seq: number; capacity: number; roomType: RoomTypeKey | null; category: OfficeCategory; locked: boolean; hotelId: string | null; members: OfficePerson[]; isNew: boolean }

const sameType = (a: RoomTypeKey | null, b: RoomTypeKey | null) => (a ?? null) === (b ?? null);
const housed = (r: { members: OfficePerson[] }) => r.members.filter((m) => !m.noHousing);
const free = (r: Sim) => r.capacity - housed(r).length;

/**
 * Plans rooms for `people` (not yet in a room) given the current `rooms`. Rules in order:
 * 1 family/companion groups stay together; 2 no men and women together outside a shared group; 3 only the same
 * room type shares a room; 4 keep each agent / single-agent bus apart; 5 fill partly filled rooms first, then reuse an
 * empty one, then open a new one; 6 never exceed capacity; 7 locked rooms are never touched (callers keep MANUAL members
 * out of `people`).
 */
export function planAssignments(rooms: OfficeRoomState[], people: OfficePerson[], ctx: TripContext, defaultCapacity: number = DEFAULT_OFFICE_CAPACITY): Plan {
  const sims: Sim[] = rooms.map((r) => ({ id: r.id, code: r.code, seq: r.seq, capacity: r.capacity, roomType: r.roomType, category: r.category, locked: r.locked, hotelId: r.hotelId ?? null, members: [...r.members], isNew: false }));
  const plan: Plan = { placements: new Map(), newRooms: [], splitGroups: [] };
  let temp = 0;

  const put = (room: Sim, p: OfficePerson) => { room.members.push(p); plan.placements.set(p.bookingId, room.id); };
  const open = (members: OfficePerson[], type: RoomTypeKey | null): Sim => {
    const hotelId = members[0]?.hotelId ?? null;
    const code = codeFor(members, ctx);
    const room: Sim = { id: `new:${++temp}`, code, seq: nextSeq(sims, code), capacity: capacityFor(type, defaultCapacity), roomType: type, category: categoryOf(members), locked: false, hotelId, members: [], isNew: true };
    sims.push(room);
    plan.newRooms.push({ hotelId, tempId: room.id, code: room.code, seq: room.seq, capacity: room.capacity, roomType: type, category: room.category });
    return room;
  };
  const sameHotel = (room: Sim, p: OfficePerson) => housed(room).every((m) => m.hotelId === p.hotelId) && (!room.hotelId || !p.hotelId || room.hotelId === p.hotelId);
  const sameSegment = (room: Sim, p: OfficePerson) => room.members.every((m) => segmentOf(m, ctx) === segmentOf(p, ctx));
  const genderOk = (room: Sim, p: OfficePerson) => room.members.length === 0 || (room.category === (p.gender === "FEMALE" ? "WOMEN" : "MEN") && room.members.every((m) => m.gender === p.gender && !m.inFamily));
  // an empty room can only be reused by someone who would get the same label prefix back (rooms keep their number)
  const emptyReusable = (room: Sim, members: OfficePerson[]) => room.members.length === 0 && (room.code ?? "") === (codeFor(members, ctx) ?? "") && (room.hotelId ?? null) === (members[0].hotelId ?? null);

  const bySize = (a: Sim, b: Sim) => free(a) - free(b) || a.seq - b.seq;

  function placeSingle(p: OfficePerson) {
    const type = p.roomType;
    const usable = (r: Sim) => !r.locked && sameType(r.roomType, type) && free(r) > 0;
    const partial = sims.filter((r) => usable(r) && r.members.length > 0 && genderOk(r, p) && sameSegment(r, p) && sameHotel(r, p)).sort(bySize);
    if (partial.length) return put(partial[0], p);
    const empty = sims.filter((r) => usable(r) && emptyReusable(r, [p])).sort((a, b) => a.seq - b.seq);
    if (empty.length) { const r = empty[0]; r.category = categoryOf([p]); r.hotelId = p.hotelId; return put(r, p); }
    put(open([p], type), p);
  }

  function placeCluster(group: OfficePerson[]) {
    // only the same room type shares a room: a mixed-type group is split by type
    const keys = [...new Set(group.map((g) => `${g.roomType}|${g.hotelId}`))];
    if (keys.length > 1) { for (const k of keys) placeCluster(group.filter((g) => `${g.roomType}|${g.hotelId}` === k)); return; }
    const type = group[0].roomType;
    let rest = [...group];
    // mates already housed in an unlocked room of this type: join them first
    const gid = group[0].groupIds[0];
    const mateRooms = sims.filter((r) => !r.locked && sameType(r.roomType, type) && free(r) > 0 && r.members.some((m) => m.groupIds.includes(gid)) && sameHotel(r, group[0])).sort(bySize);
    for (const r of mateRooms) while (rest.length && free(r) > 0) put(r, rest.shift()!);
    while (rest.length) {
      const cap = capacityFor(type, defaultCapacity);
      const need = Math.min(rest.length, cap);
      const mixed = new Set(rest.map((g) => g.gender)).size > 1 || rest.some((g) => g.inFamily);
      const fits = (r: Sim) => !r.locked && sameType(r.roomType, type) && free(r) >= need && (r.members.length === 0
        ? emptyReusable(r, rest.slice(0, need))
        : !mixed && r.category === categoryOf(rest) && r.members.every((m) => m.gender === rest[0].gender && !m.inFamily) && sameSegment(r, rest[0]) && sameHotel(r, rest[0]));
      const room = sims.filter(fits).sort((a, b) => Number(b.members.length > 0) - Number(a.members.length > 0) || bySize(a, b))[0] ?? open(rest.slice(0, need), type);
      if (room.members.length === 0) { room.category = categoryOf(rest.slice(0, need)); room.hotelId = rest[0].hotelId; }
      for (let i = 0; i < need; i++) put(room, rest.shift()!);
      if (rest.length && !plan.splitGroups.includes(gid)) plan.splitGroups.push(gid);
    }
  }

  // groups first (largest first, rule 1), then the rest in the order given
  const clusters = new Map<string, OfficePerson[]>();
  const singles: OfficePerson[] = [];
  const noBed: OfficePerson[] = [];
  for (const p of people) {
    if (p.noHousing) { noBed.push(p); continue; }
    if (p.groupIds.length) clusters.set(p.groupIds[0], [...(clusters.get(p.groupIds[0]) ?? []), p]);
    else singles.push(p);
  }
  for (const g of [...clusters.values()].sort((a, b) => b.length - a.length)) {
    const housedMate = sims.some((r) => r.members.some((m) => m.groupIds.includes(g[0].groupIds[0])));
    if (g.length === 1 && !housedMate) singles.unshift(g[0]); else placeCluster(g);
  }
  for (const p of singles) placeSingle(p);
  // بدون سكن: no bed, goes into the room of a housed member of his family (his head)
  for (const p of noBed) {
    const room = sims.find((r) => r.members.some((m) => !m.noHousing && m.groupIds.some((g) => p.groupIds.includes(g))));
    if (room) put(room, p);
  }
  return plan;
}

/** Warning text when a member does not suit the room (gender or room type), else null. Never moves anyone. */
export const ROOM_MISFIT = "الغرفة لا تناسب المعتمر";
export function memberWarning(room: Pick<OfficeRoomState, "category" | "roomType"> & { code?: string | null; hotelId?: string | null }, m: OfficePerson, agentCodes?: Map<string, string | null>): string | null {
  if (room.category === "MEN" && m.gender === "FEMALE") return ROOM_MISFIT;
  if (room.category === "WOMEN" && m.gender === "MALE") return ROOM_MISFIT;
  if (!m.noHousing && m.roomType && room.roomType && m.roomType !== room.roomType) return ROOM_MISFIT;
  if (!m.noHousing && room.hotelId && m.hotelId && room.hotelId !== m.hotelId) return ROOM_MISFIT;
  // the room carries an agent's code but this pilgrim no longer belongs to that agent (e.g. his agent was changed)
  if (room.code && agentCodes && (m.agentId ? agentCodes.get(m.agentId) ?? null : null) !== room.code) return ROOM_MISFIT;
  return null;
}

export function roomSummary(rooms: OfficeRoomState[], agentCodes?: Map<string, string | null>) {
  const warnings = rooms.reduce((n, r) => n + r.members.filter((m) => memberWarning(r, m, agentCodes)).length, 0);
  const pilgrims = rooms.reduce((n, r) => n + r.members.length, 0);
  const emptyBeds = rooms.reduce((n, r) => n + Math.max(0, r.capacity - housed(r).length), 0);
  return { rooms: rooms.length, pilgrims, emptyBeds, warnings };
}

/** Renumbers each code's sequence 1..n without gaps, keeping the current order. */
export function renumber(rooms: { id: string; code: string | null; seq: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const byCode = new Map<string, typeof rooms>();
  for (const r of rooms) byCode.set(r.code ?? "", [...(byCode.get(r.code ?? "") ?? []), r]);
  for (const list of byCode.values()) [...list].sort((a, b) => a.seq - b.seq).forEach((r, i) => out.set(r.id, i + 1));
  return out;
}

/** Print order: coded rooms first (by code, then number), then plain numbers. */
export function printOrder<T extends { code: string | null; seq: number }>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => {
    if (!!a.code !== !!b.code) return a.code ? -1 : 1;
    return (a.code ?? "").localeCompare(b.code ?? "") || a.seq - b.seq;
  });
}

/** True for a valid agent room code: 1 or 2 lowercase Latin letters. */
export const isRoomCode = (v: string) => /^[a-z]{1,2}$/.test(v);
