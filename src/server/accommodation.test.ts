import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { applyAccommodation } from "./accommodation";
import { addPilgrimToTrips } from "./bookings";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.roomAssignment.deleteMany(); await db.seatAssignment.deleteMany(); await db.room.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany();
  await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.hotel.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

let n = 0;
async function setup(gender: "MALE" | "FEMALE" = "MALE") {
  const p = await db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender, birthDate: D("1980-01-01"), passportNo: `AC${++n}-${Date.now()}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
  return p;
}

describe("accommodation when adding a pilgrim", () => {
  it("stores his own hotel, creates the room, sets room type and the trip's price", async () => {
    const h1 = await db.hotel.create({ data: { officialName: "Hotel One", city: "MAKKAH" } });
    const h2 = await db.hotel.create({ data: { officialName: "Hotel Two", city: "MAKKAH" } });
    const t = await db.trip.create({ data: { name: "رحلة", transportType: "AIR", capacity: 10, makkahHotelId: h1.id } });
    await db.tripPrice.create({ data: { tripId: t.id, roomType: "QUAD", currency: "USD", amount: 1200 } });
    const p = await setup();
    await addPilgrimToTrips(db, p.id, null, [t.id]);
    const b = await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id } });
    const r = await applyAccommodation(t.id, b.id, { makkahHotelId: h2.id, roomType: "QUAD", makkahRoomNo: "305" });
    expect(r.ok).toBe(true);
    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { rooms: { include: { room: true } } } });
    expect(after.makkahHotelId).toBe(h2.id); expect(after.roomType).toBe("QUAD"); expect(after.priceAmount).toBe(1200);
    expect(after.rooms[0].room).toMatchObject({ roomNo: "305", hotelId: h2.id, type: "QUAD", beds: 4 });
  });

  it("refuses a room of another hotel, a wrong room type, a full room and a man+woman mix — changing nothing", async () => {
    const h1 = await db.hotel.create({ data: { officialName: "Hotel One", city: "MAKKAH" } });
    const h2 = await db.hotel.create({ data: { officialName: "Hotel Two", city: "MAKKAH" } });
    const t = await db.trip.create({ data: { name: "رحلة", transportType: "AIR", capacity: 10 } });
    const [a, b, c] = [await setup(), await setup(), await setup("FEMALE")];
    for (const p of [a, b, c]) await addPilgrimToTrips(db, p.id, null, [t.id]);
    const bk = async (pid: string) => (await db.booking.findFirstOrThrow({ where: { pilgrimId: pid } })).id;
    expect((await applyAccommodation(t.id, await bk(a.id), { makkahHotelId: h1.id, roomType: "DOUBLE", makkahRoomNo: "1" })).ok).toBe(true);
    const other = await applyAccommodation(t.id, await bk(b.id), { makkahHotelId: h2.id, roomType: "DOUBLE", makkahRoomNo: "1" });
    expect(other).toMatchObject({ ok: false }); expect((other as { error: string }).error).toContain("فندق آخر");
    expect((await applyAccommodation(t.id, await bk(b.id), { makkahHotelId: h1.id, roomType: "QUAD", makkahRoomNo: "1" })).ok).toBe(false);
    const mix = await applyAccommodation(t.id, await bk(c.id), { makkahHotelId: h1.id, roomType: "DOUBLE", makkahRoomNo: "1" });
    expect(mix.ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: await bk(c.id) } })).makkahHotelId).toBeNull(); // rolled back
    expect((await applyAccommodation(t.id, await bk(b.id), { makkahHotelId: h1.id, roomType: "DOUBLE", makkahRoomNo: "1" })).ok).toBe(true); // 2nd bed
    const d = await setup(); await addPilgrimToTrips(db, d.id, null, [t.id]);
    expect((await applyAccommodation(t.id, await bk(d.id), { makkahHotelId: h1.id, roomType: "DOUBLE", makkahRoomNo: "1" })).ok).toBe(false); // full
  });

  it("an empty room number removes the room assignment of that city", async () => {
    const h = await db.hotel.create({ data: { officialName: "H", city: "MADINAH" } });
    const t = await db.trip.create({ data: { name: "رحلة", transportType: "AIR", capacity: 10 } });
    const p = await setup(); await addPilgrimToTrips(db, p.id, null, [t.id]);
    const b = await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id } });
    await applyAccommodation(t.id, b.id, { madinahHotelId: h.id, roomType: "DOUBLE", madinahRoomNo: "7" });
    expect(await db.roomAssignment.count({ where: { bookingId: b.id } })).toBe(1);
    await applyAccommodation(t.id, b.id, { madinahHotelId: h.id, roomType: "DOUBLE", madinahRoomNo: "" });
    expect(await db.roomAssignment.count({ where: { bookingId: b.id } })).toBe(0);
  });
});
