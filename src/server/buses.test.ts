import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { addPilgrimToTrips } from "./bookings";
import { ensureFirstBus, moveBookingsToBus, withTripLock } from "./buses";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.roomAssignment.deleteMany(); await db.seatAssignment.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany();
  await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

let n = 0;
const pilgrim = () => db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"),
  passportNo: `BUS${++n}-${Date.now()}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
const land = () => db.trip.create({ data: { name: "بري", transportType: "LAND", capacity: 100 } });
const seatsOf = async (tripId: string) => (await db.seatAssignment.findMany({ where: { bus: { tripId } }, include: { bus: true } })).map((s) => `${s.bus!.number}:${s.seatNo}`).sort();

describe("automatic bus filling", () => {
  it("opens bus 1 on first booking and fills the lowest free seat", async () => {
    const t = await land();
    const [a, b] = [await pilgrim(), await pilgrim()];
    await addPilgrimToTrips(db, a.id, null, [t.id]); await addPilgrimToTrips(db, b.id, null, [t.id]);
    expect(await db.bus.count({ where: { tripId: t.id } })).toBe(1);
    expect(await seatsOf(t.id)).toEqual(["1:1", "1:2"]);
  });

  it("opens the next numbered bus when the general buses are full; named buses are skipped", async () => {
    const t = await land();
    await db.bus.create({ data: { tripId: t.id, number: "1", seatCount: 2 } });
    await db.bus.create({ data: { tripId: t.id, number: "7", name: "باص خالد", seatCount: 50 } });
    for (let i = 0; i < 3; i++) await addPilgrimToTrips(db, (await pilgrim()).id, null, [t.id]);
    const buses = await db.bus.findMany({ where: { tripId: t.id }, orderBy: { number: "asc" } });
    expect(buses.map((x) => x.number)).toEqual(["1", "2", "7"]);
    expect(buses.find((x) => x.number === "2")!.seatCount).toBe(2);
    expect(await seatsOf(t.id)).toEqual(["1:1", "1:2", "2:1"]);
  });

  it("freed seats are reused before opening a new bus", async () => {
    const t = await land();
    await db.bus.create({ data: { tripId: t.id, number: "1", seatCount: 2 } });
    const [a, b, c] = [await pilgrim(), await pilgrim(), await pilgrim()];
    await addPilgrimToTrips(db, a.id, null, [t.id]); await addPilgrimToTrips(db, b.id, null, [t.id]);
    await db.seatAssignment.deleteMany({ where: { booking: { pilgrimId: a.id } } });
    await addPilgrimToTrips(db, c.id, null, [t.id]);
    expect(await seatsOf(t.id)).toEqual(["1:1", "1:2"]);
  });

  it("concurrent additions never share a seat", async () => {
    const t = await land();
    await db.bus.create({ data: { tripId: t.id, number: "1", seatCount: 4 } });
    const ps = await Promise.all(Array.from({ length: 7 }, pilgrim));
    await Promise.all(ps.map((p) => addPilgrimToTrips(db, p.id, null, [t.id])));
    const seats = await seatsOf(t.id);
    expect(new Set(seats).size).toBe(7);
    expect(await db.bus.count({ where: { tripId: t.id } })).toBe(2);
  });

  it("air trips are not seated; ensureFirstBus skips them", async () => {
    const t = await db.trip.create({ data: { name: "جوي", transportType: "AIR", capacity: 10 } });
    await addPilgrimToTrips(db, (await pilgrim()).id, null, [t.id]);
    await withTripLock(db, t.id, (tx) => ensureFirstBus(tx, t.id));
    expect(await db.bus.count({ where: { tripId: t.id } })).toBe(0);
    expect(await db.seatAssignment.count()).toBe(0);
  });
});

describe("moving pilgrims between buses", () => {
  it("refuses when the target lacks seats and changes nothing", async () => {
    const t = await land();
    const b1 = await db.bus.create({ data: { tripId: t.id, number: "1", seatCount: 4 } });
    const b2 = await db.bus.create({ data: { tripId: t.id, number: "2", seatCount: 1 } });
    const ps = [await pilgrim(), await pilgrim()];
    for (const p of ps) await addPilgrimToTrips(db, p.id, null, [t.id]);
    const ids = (await db.booking.findMany({ where: { tripId: t.id } })).map((b) => b.id);
    const r = await moveBookingsToBus(t.id, b2.id, ids);
    expect(r.ok).toBe(false);
    expect(await db.seatAssignment.count({ where: { busId: b1.id } })).toBe(2);
  });

  it("moves several pilgrims and keeps a companion group together", async () => {
    const t = await land();
    await db.bus.create({ data: { tripId: t.id, number: "1", seatCount: 8 } });
    const b2 = await db.bus.create({ data: { tripId: t.id, number: "2", seatCount: 8 } });
    const ps = [await pilgrim(), await pilgrim(), await pilgrim()];
    for (const p of ps) await addPilgrimToTrips(db, p.id, null, [t.id]);
    const bookings = await db.booking.findMany({ where: { tripId: t.id }, orderBy: { createdAt: "asc" } });
    const g = await db.familyGroup.create({ data: { kind: "COMPANIONS" } });
    await db.bookingGroupMember.createMany({ data: [bookings[0], bookings[1]].map((b) => ({ bookingId: b.id, groupId: g.id })) });
    const r = await moveBookingsToBus(t.id, b2.id, [bookings[0].id]); // only one selected; its mate follows
    expect(r).toEqual({ ok: true, moved: 2 });
    const moved = await db.seatAssignment.findMany({ where: { busId: b2.id }, orderBy: { seatNo: "asc" } });
    expect(moved.map((m) => m.seatNo)).toEqual([1, 2]);
    expect((await db.seatAssignment.findUnique({ where: { bookingId: bookings[2].id } }))!.busId).not.toBe(b2.id);
  });
});
