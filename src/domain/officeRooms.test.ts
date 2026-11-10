import { describe, it, expect } from "vitest";
import { capacityFor, categoryOf, codeFor, memberWarning, nextSeq, planAssignments, printOrder, renumber, roomLabel, roomSummary, isRoomCode, ROOM_MISFIT,
  type OfficePerson, type OfficeRoomState, type TripContext } from "./officeRooms";
import { ROOM_BEDS, ROOM_TYPE_LABELS } from "./rooming";

let n = 0;
const person = (o: Partial<OfficePerson> = {}): OfficePerson => ({ bookingId: `b${++n}`, gender: "MALE", groupIds: [], inFamily: false, roomType: null, agentId: null, busId: null, hotelId: null, noHousing: false, ...o });
const AIR: TripContext = { transport: "AIR", agentCodes: new Map([["A", "a"], ["B", "b"], ["N", null]]), busAgent: new Map() };
const LAND = (busAgent: [string, string | null][]): TripContext => ({ transport: "LAND", agentCodes: new Map([["A", "a"], ["B", "b"]]), busAgent: new Map(busAgent) });
const room = (o: Partial<OfficeRoomState> & { id: string }): OfficeRoomState => ({ code: null, seq: 1, capacity: 4, roomType: null, category: "MEN", locked: false, members: [], ...o });

/** applies a plan: returns rooms (existing + new) with their member booking ids */
function run(rooms: OfficeRoomState[], people: OfficePerson[], ctx: TripContext = AIR, cap = 4) {
  const plan = planAssignments(rooms, people, ctx, cap);
  const all = new Map<string, string[]>();
  for (const r of rooms) all.set(r.id, r.members.map((m) => m.bookingId));
  for (const nr of plan.newRooms) all.set(nr.tempId, []);
  for (const [b, rid] of plan.placements) all.get(rid)!.push(b);
  return { plan, all, newRoom: (id: string) => plan.newRooms.find((r) => r.tempId === id)! };
}
const roomOf = (res: ReturnType<typeof run>, b: OfficePerson) => [...res.all].find(([, ids]) => ids.includes(b.bookingId))![0];

describe("room types and capacity", () => {
  it("SINGLE exists with one bed and the label سنكل; capacity follows the paid room type", () => {
    expect(ROOM_BEDS.SINGLE).toBe(1); expect(ROOM_TYPE_LABELS.SINGLE).toBe("سنكل");
    expect(capacityFor("TRIPLE")).toBe(3); expect(capacityFor("SINGLE")).toBe(1); expect(capacityFor("QUINT")).toBe(5);
    expect(capacityFor(null)).toBe(4); expect(capacityFor(null, 6)).toBe(6);
  });
  it("a TRIPLE pilgrim goes in a room of 3, a booking without a type in the default capacity", () => {
    const ps = Array.from({ length: 4 }, () => person({ roomType: "TRIPLE" }));
    const r = run([], ps);
    expect(r.plan.newRooms.map((x) => x.capacity)).toEqual([3, 3]);
    const d = run([], Array.from({ length: 5 }, () => person()), AIR, 4);
    expect(d.plan.newRooms.map((x) => x.capacity)).toEqual([4, 4]);
  });
  it("only the same room type shares a room; a single room holds one", () => {
    const a = person({ roomType: "DOUBLE" }), b = person({ roomType: "TRIPLE" }), c = person({ roomType: "SINGLE" }), d = person({ roomType: "SINGLE" });
    const r = run([], [a, b, c, d]);
    expect(new Set([roomOf(r, a), roomOf(r, b), roomOf(r, c), roomOf(r, d)]).size).toBe(4);
  });
});

describe("placement rules", () => {
  it("never exceeds capacity and fills partly filled rooms first", () => {
    const existing = room({ id: "r1", seq: 1, capacity: 4, members: [{ ...person(), assignedBy: "AUTO" }, { ...person(), assignedBy: "AUTO" }], category: "MEN" });
    const ps = Array.from({ length: 5 }, () => person());
    const r = run([existing], ps);
    expect(r.all.get("r1")!.length).toBe(4);
    expect(r.plan.newRooms).toHaveLength(1);
    expect(Math.max(...[...r.all.values()].map((x) => x.length))).toBeLessThanOrEqual(4);
  });
  it("men and women are never mixed, women get their own rooms", () => {
    const m = person(), f = person({ gender: "FEMALE" });
    const r = run([], [m, f]);
    expect(roomOf(r, m)).not.toBe(roomOf(r, f));
    expect(r.newRoom(roomOf(r, f)).category).toBe("WOMEN");
  });
  it("a family or companion group stays in one room, even mixed genders (FAMILY room)", () => {
    const g = ["g1"];
    const fam = [person({ groupIds: g, inFamily: true }), person({ groupIds: g, inFamily: true, gender: "FEMALE" }), person({ groupIds: g, inFamily: true, gender: "FEMALE" })];
    const loner = person();
    const r = run([], [loner, ...fam]);
    expect(new Set(fam.map((f) => roomOf(r, f))).size).toBe(1);
    expect(roomOf(r, loner)).not.toBe(roomOf(r, fam[0]));
    expect(r.newRoom(roomOf(r, fam[0])).category).toBe("FAMILY");
  });
  it("joins the housed mates of a group, spreads a group bigger than one room (and says so)", () => {
    const g = ["g2"];
    const mate = { ...person({ groupIds: g, inFamily: true }), assignedBy: "AUTO" as const };
    const existing = room({ id: "r1", category: "FAMILY", members: [mate] });
    const newcomer = person({ groupIds: g, inFamily: true });
    expect(run([existing], [newcomer]).all.get("r1")).toContain(newcomer.bookingId);
    const big = Array.from({ length: 6 }, () => person({ groupIds: ["g3"] }));
    const r = run([], big);
    expect(r.plan.newRooms).toHaveLength(2); expect(r.plan.splitGroups).toEqual(["g3"]);
  });
  it("locked rooms are never filled", () => {
    const locked = room({ id: "L", locked: true, members: [{ ...person(), assignedBy: "AUTO" }] });
    const p = person();
    const r = run([locked], [p]);
    expect(r.all.get("L")).not.toContain(p.bookingId);
    expect(r.plan.newRooms).toHaveLength(1);
  });
  it("reuses an empty room (its number is kept) before opening a new one", () => {
    const empty = room({ id: "E", seq: 7 });
    const r = run([empty], [person()]);
    expect(r.all.get("E")).toHaveLength(1); expect(r.plan.newRooms).toHaveLength(0);
  });
});

describe("agent codes and numbering", () => {
  it("air: one agent per room; a coded agent's rooms get the code, numbering is per code", () => {
    const a1 = person({ agentId: "A" }), a2 = person({ agentId: "A" }), b1 = person({ agentId: "B" }), n1 = person({ agentId: "N" }), none = person();
    const r = run([], [a1, a2, b1, n1, none], AIR);
    expect(roomOf(r, a1)).toBe(roomOf(r, a2));
    expect(roomLabel(r.newRoom(roomOf(r, a1)))).toBe("a1");
    expect(roomLabel(r.newRoom(roomOf(r, b1)))).toBe("b1");
    expect(r.newRoom(roomOf(r, n1)).code).toBeNull(); // agent without a code → plain number
    expect(roomLabel(r.newRoom(roomOf(r, n1)))).toBe("1");
    expect(roomLabel(r.newRoom(roomOf(r, none)))).toBe("2"); // plain numbers have their own sequence, never mixing agents
  });
  it("numbers continue after existing rooms of the same code", () => {
    expect(nextSeq([{ code: "a", seq: 1 }, { code: "a", seq: 5 }, { code: null, seq: 9 }], "a")).toBe(6);
    expect(nextSeq([{ code: "a", seq: 1 }], null)).toBe(1);
  });
  it("land: a room gets the agent code only on a bus that carries only that agent's pilgrims", () => {
    const ctx = LAND([["bus1", "A"], ["bus2", null]]);
    const on1 = person({ agentId: "A", busId: "bus1" }), on2 = person({ agentId: "A", busId: "bus2" });
    const r = run([], [on1, on2], ctx);
    expect(roomOf(r, on1)).not.toBe(roomOf(r, on2));
    expect(roomLabel(r.newRoom(roomOf(r, on1)))).toBe("a1");
    expect(r.newRoom(roomOf(r, on2)).code).toBeNull();
    expect(codeFor([on1], ctx)).toBe("a"); expect(codeFor([on2], ctx)).toBeNull();
  });
  it("a room with pilgrims of different agents gets a plain number", () => {
    expect(codeFor([person({ agentId: "A" }), person({ agentId: "B" })], AIR)).toBeNull();
    expect(codeFor([], AIR)).toBeNull();
  });
  it("renumber closes the gaps per code; print order puts coded rooms first", () => {
    const m = renumber([{ id: "x", code: "a", seq: 2 }, { id: "y", code: "a", seq: 7 }, { id: "z", code: null, seq: 4 }]);
    expect(m.get("x")).toBe(1); expect(m.get("y")).toBe(2); expect(m.get("z")).toBe(1);
    expect(printOrder([{ code: null, seq: 1 }, { code: "b", seq: 1 }, { code: "a", seq: 2 }, { code: "a", seq: 1 }]).map(roomLabel)).toEqual(["a1", "a2", "b1", "1"]);
  });
  it("room codes are 1 or 2 lowercase letters", () => {
    for (const ok of ["a", "z", "aa", "ab"]) expect(isRoomCode(ok)).toBe(true);
    for (const bad of ["", "A", "abc", "a1", "1", "ا"]) expect(isRoomCode(bad)).toBe(false);
  });
});

describe("warnings and summary (nobody is moved)", () => {
  it("flags a woman in a men's room and a wrong room type", () => {
    const w = person({ gender: "FEMALE" }), t = person({ roomType: "DOUBLE" });
    expect(memberWarning({ category: "MEN", roomType: null }, w)).toBe(ROOM_MISFIT);
    expect(memberWarning({ category: "FAMILY", roomType: null }, w)).toBeNull();
    expect(memberWarning({ category: "MEN", roomType: "TRIPLE" }, t)).toBe(ROOM_MISFIT);
    expect(categoryOf([w, person()])).toBe("FAMILY");
    const s = roomSummary([room({ id: "r", capacity: 4, members: [{ ...w, assignedBy: "AUTO" }, { ...person(), assignedBy: "AUTO" }] })]);
    expect(s).toEqual({ rooms: 1, pilgrims: 2, emptyBeds: 2, warnings: 1 });
  });
});

describe("agent changed after the pilgrim was housed", () => {
  it("a coded room warns when a member no longer belongs to that agent; nobody is moved", () => {
    const codes = new Map<string, string | null>([["A", "a"], ["B", "b"]]);
    const stay = person({ agentId: "A" }), moved = person({ agentId: "B" });
    expect(memberWarning({ category: "MEN", roomType: null, code: "a" }, stay, codes)).toBeNull();
    expect(memberWarning({ category: "MEN", roomType: null, code: "a" }, moved, codes)).toBe(ROOM_MISFIT);
    expect(memberWarning({ category: "MEN", roomType: null, code: null }, moved, codes)).toBeNull(); // plain rooms fit everybody
  });
});

describe("C8 hotel and بدون سكن", () => {
  it("different hotels never share a room", () => {
    const a = person({ hotelId: "H1" }), b = person({ hotelId: "H2" }), c = person({ hotelId: "H1" });
    const plan = planAssignments([], [a, b, c], AIR);
    expect(plan.placements.get(a.bookingId)).toBe(plan.placements.get(c.bookingId));
    expect(plan.placements.get(a.bookingId)).not.toBe(plan.placements.get(b.bookingId));
    expect(plan.newRooms.map((r) => r.hotelId).sort()).toEqual(["H1", "H2"]);
  });
  it("a no-housing pilgrim goes into his family's room without taking a bed", () => {
    const head = person({ groupIds: ["g"], inFamily: true, roomType: "DOUBLE", hotelId: "H1" });
    const mate = person({ groupIds: ["g"], inFamily: true, roomType: "DOUBLE", hotelId: "H1" });
    const kid = person({ groupIds: ["g"], inFamily: true, roomType: null, hotelId: "H1", noHousing: true });
    const plan = planAssignments([], [head, mate, kid], AIR);
    expect(plan.placements.get(kid.bookingId)).toBe(plan.placements.get(head.bookingId));
    expect(plan.newRooms).toHaveLength(1); // the room of 2 is full yet the kid fits
  });
});
