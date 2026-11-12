import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/server/db";
import { addPilgrimToTrips } from "@/server/bookings";
import { cancelBooking, moveToTrip } from "@/server/payments";
import { assignOfficeRooms, gatherGroupInOfficeRooms, createOfficeRoom, deleteOfficeRoom, moveOfficeMember, renumberOfficeRooms, rerunAssignment } from "./service";
import { roomLabel } from "@/domain/officeRooms";

const D = (s: string) => new Date(s + "T00:00:00Z");
const user = { id: "acc1", username: "acc", name: "المحاسب", role: "ACCOUNTANT" as const };
async function wipe() {
  await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany();
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.roomAssignment.deleteMany(); await db.seatAssignment.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany();
  await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

let n = 0;
const pilgrim = (o: { gender?: "MALE" | "FEMALE"; agentId?: string } = {}) => db.pilgrim.create({ data: { firstName: `م${++n}`, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: o.gender ?? "MALE", birthDate: D("1980-01-01"),
  passportNo: `A${String(40000000 + n)}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01"), agentId: o.agentId } });
const trip = (type: "AIR" | "LAND" = "AIR") => db.trip.create({ data: { name: "رحلة", transportType: type, capacity: 50 } });
const rooms = (tripId: string) => db.officeRoom.findMany({ where: { tripId }, include: { members: true }, orderBy: [{ code: "asc" }, { seq: "asc" }] });
const add = async (tripId: string, p: { id: string; agentId: string | null }) => { await addPilgrimToTrips(db, p.id, p.agentId, [tripId]); return db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId } }); };

describe("office rooms: automatic assignment", () => {
  it("every new booking lands in an office room; men and women apart; capacity respected", async () => {
    const t = await trip();
    const men = await Promise.all(Array.from({ length: 5 }, () => pilgrim()));
    const w = await pilgrim({ gender: "FEMALE" });
    for (const p of [...men, w]) await add(t.id, p);
    const rs = await rooms(t.id);
    expect(rs.reduce((s, r) => s + r.members.length, 0)).toBe(6);
    expect(rs.every((r) => r.members.length <= r.capacity)).toBe(true);
    expect(rs.filter((r) => r.category === "WOMEN")).toHaveLength(1);
    expect(rs.find((r) => r.category === "MEN")!.members).toHaveLength(4); // default capacity 4
    expect(rs.map(roomLabel).sort()).toEqual(["1", "2", "3"]);
  });

  it("capacity comes from the room type paid for", async () => {
    const t = await trip();
    const ps = await Promise.all(Array.from({ length: 3 }, () => pilgrim()));
    const bs = [];
    for (const p of ps) bs.push(await add(t.id, p));
    // the rooms were made without a type; pilgrims with a TRIPLE booking placed afterwards fill rooms of 3
    const t2 = await trip();
    const more = await Promise.all(Array.from({ length: 4 }, () => pilgrim()));
    for (const p of more) await db.booking.create({ data: { pilgrimId: p.id, tripId: t2.id, roomType: "TRIPLE" } });
    await assignOfficeRooms(db as never, t2.id).catch(() => null);
    await db.$transaction((tx) => assignOfficeRooms(tx, t2.id));
    const rs = await rooms(t2.id);
    expect(rs.map((r) => r.capacity).sort()).toEqual([3, 3]);
    expect(rs.every((r) => r.roomType === "TRIPLE")).toBe(true);
  });

  it("agent codes: a coded agent's pilgrims get a1, a2…; plain numbers have their own sequence", async () => {
    const a = await db.agent.create({ data: { name: "أ", roomCode: "a" } });
    const t = await trip();
    for (let i = 0; i < 5; i++) await add(t.id, await pilgrim({ agentId: a.id }));
    await add(t.id, await pilgrim());
    const labels = (await rooms(t.id)).map(roomLabel).sort();
    expect(labels).toEqual(["1", "a1", "a2"]);
  });

  it("a cancelled booking frees its bed but the room keeps its number; the bed is reused", async () => {
    const t = await trip();
    const p1 = await pilgrim(), p2 = await pilgrim();
    const b1 = await add(t.id, p1); await add(t.id, p2);
    expect((await cancelBooking(user, b1.id, "اختبار")).ok).toBe(true);
    let rs = await rooms(t.id);
    expect(rs).toHaveLength(1); expect(rs[0].members).toHaveLength(1);
    await add(t.id, await pilgrim());
    rs = await rooms(t.id);
    expect(rs).toHaveLength(1); expect(rs[0].members).toHaveLength(2);
    await add(t.id, await pilgrim()); await add(t.id, await pilgrim()); await add(t.id, await pilgrim()); // 5th pilgrim opens room 2
    expect((await rooms(t.id)).map((r) => r.seq).sort()).toEqual([1, 2]);
  });

  it("moving a pilgrim to another trip leaves the old room and is assigned in the new trip", async () => {
    const t1 = await trip(), t2 = await trip();
    const p = await pilgrim();
    const b = await add(t1.id, p);
    const r = await moveToTrip(user, b.id, t2.id);
    expect(r.ok).toBe(true);
    expect((await rooms(t1.id))[0].members).toHaveLength(0);
    expect((await rooms(t2.id)).reduce((s, x) => s + x.members.length, 0)).toBe(1);
  });
});

describe("office rooms: manual changes", () => {
  it("manual move (MANUAL), capacity and lock rules, warnings never move anyone", async () => {
    const t = await trip();
    const b: Awaited<ReturnType<typeof add>>[] = [];
    for (let i = 0; i < 5; i++) b.push(await add(t.id, await pilgrim()));
    const rs = await rooms(t.id);
    const [full, other] = [rs.find((r) => r.members.length === 4)!, rs.find((r) => r.members.length === 1)!];
    expect((await db.$transaction((tx) => moveOfficeMember(tx, t.id, b[4].id, full.id)))).toEqual({ ok: false, error: "الغرفة ممتلئة" });
    expect((await db.$transaction((tx) => moveOfficeMember(tx, t.id, full.members[0].bookingId, other.id))).ok).toBe(true);
    expect((await db.officeRoomMember.findUniqueOrThrow({ where: { bookingId: full.members[0].bookingId } })).assignedBy).toBe("MANUAL");
    await db.officeRoom.update({ where: { id: other.id }, data: { locked: true } });
    expect((await db.$transaction((tx) => moveOfficeMember(tx, t.id, full.members[1].bookingId, other.id)))).toEqual({ ok: false, error: "الغرفة مقفلة" });
    // a woman dragged into a men's room: allowed, shown as a warning, nobody is moved
    const w = await add(t.id, await pilgrim({ gender: "FEMALE" }));
    const menRoom = (await rooms(t.id)).find((r) => r.category === "MEN" && !r.locked && r.members.length < r.capacity)!;
    expect((await db.$transaction((tx) => moveOfficeMember(tx, t.id, w.id, menRoom.id))).ok).toBe(true);
    expect((await db.officeRoomMember.findUniqueOrThrow({ where: { bookingId: w.id } })).officeRoomId).toBe(menRoom.id);
  });

  it("re-run keeps locked rooms and MANUAL members, re-places only the AUTO members of unlocked rooms", async () => {
    const t = await trip();
    const bs = [];
    for (let i = 0; i < 6; i++) bs.push(await add(t.id, await pilgrim()));
    const rs = await rooms(t.id);
    const lockedRoom = rs[0];
    await db.officeRoom.update({ where: { id: lockedRoom.id }, data: { locked: true } });
    const manual = rs[1].members[0];
    await db.officeRoomMember.update({ where: { id: manual.id }, data: { assignedBy: "MANUAL" } });
    await db.$transaction((tx) => rerunAssignment(tx, t.id));
    const after = await rooms(t.id);
    expect(after.find((r) => r.id === lockedRoom.id)!.members.map((m) => m.bookingId).sort()).toEqual(lockedRoom.members.map((m) => m.bookingId).sort());
    expect((await db.officeRoomMember.findUniqueOrThrow({ where: { bookingId: manual.bookingId } })).officeRoomId).toBe(rs[1].id);
    expect(after.reduce((s, r) => s + r.members.length, 0)).toBe(6);
  });

  it("new room, delete only when empty, admin renumber closes gaps", async () => {
    const t = await trip();
    for (let i = 0; i < 9; i++) await add(t.id, await pilgrim()); // rooms 1,2,3
    await db.$transaction((tx) => createOfficeRoom(tx, t.id));
    let rs = await rooms(t.id);
    expect(rs).toHaveLength(4);
    expect((await db.$transaction((tx) => deleteOfficeRoom(tx, t.id, rs[0].id))).ok).toBe(false); // has pilgrims
    const empty = rs.find((r) => r.members.length === 0)!;
    expect((await db.$transaction((tx) => deleteOfficeRoom(tx, t.id, empty.id))).ok).toBe(true);
    await db.officeRoom.update({ where: { id: rs[2].id }, data: { seq: 9 } });
    await db.$transaction((tx) => renumberOfficeRooms(tx, t.id));
    rs = await rooms(t.id);
    expect(rs.map((r) => r.seq).sort()).toEqual([1, 2, 3]);
  });

  it("a group formed later is gathered into one office room automatically, hand-placed and locked members stay", async () => {
    const t = await trip();
    const ps = [] as { id: string }[];
    for (let i = 0; i < 6; i++) ps.push(await pilgrim());
    const bookings: string[] = [];
    for (const p of ps) { await addPilgrimToTrips(db, p.id, null, [t.id]); bookings.push((await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId: t.id } })).id); }
    await db.booking.updateMany({ where: { id: { in: bookings } }, data: { roomType: "QUAD" } });
    const roomOf = async (id: string) => (await db.officeRoomMember.findUniqueOrThrow({ where: { bookingId: id } })).officeRoomId;
    // 6 men: a room of 4 and a room of 2. Make the first and the last a family: they must end up together.
    expect(await roomOf(bookings[0])).not.toBe(await roomOf(bookings[5]));
    const g = await db.familyGroup.create({ data: { kind: "FAMILY" } });
    await db.bookingGroupMember.createMany({ data: [{ bookingId: bookings[0], groupId: g.id, isHead: true }, { bookingId: bookings[5], groupId: g.id }] });
    await db.$transaction((tx) => gatherGroupInOfficeRooms(tx, t.id, g.id));
    expect(await roomOf(bookings[0])).toBe(await roomOf(bookings[5]));
    // a member placed by hand is not taken away
    const g2 = await db.familyGroup.create({ data: { kind: "FAMILY" } });
    await db.officeRoomMember.update({ where: { bookingId: bookings[2] }, data: { assignedBy: "MANUAL" } });
    const before = await roomOf(bookings[2]);
    await db.bookingGroupMember.createMany({ data: [{ bookingId: bookings[2], groupId: g2.id, isHead: true }, { bookingId: bookings[3], groupId: g2.id }] });
    await db.$transaction((tx) => gatherGroupInOfficeRooms(tx, t.id, g2.id));
    expect(await roomOf(bookings[2])).toBe(before);
  });
});
