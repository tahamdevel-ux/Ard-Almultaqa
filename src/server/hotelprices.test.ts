import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { applyAccommodation } from "./accommodation";
import { addPilgrimToTrips } from "./bookings";
import { saveTripHotels } from "./tripHotels";
import { agentStatementData } from "@/outputs/viewmodels";

const user = { id: "u1", username: "a", name: "مدير", role: "ADMIN" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.roomAssignment.deleteMany(); await db.seatAssignment.deleteMany(); await db.room.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany();
  await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.hotel.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

let n = 0;
const mkPilgrim = (agentId?: string) => db.pilgrim.create({ data: { motherName: "ام", firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `HP${++n}-${Date.now()}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01"), agentId } });
async function setup(air = false) {
  const h1 = await db.hotel.create({ data: { officialName: "Makkah One", city: "MAKKAH" } });
  const h2 = await db.hotel.create({ data: { officialName: "Makkah Two", city: "MAKKAH" } });
  const t = await db.trip.create({ data: { name: "رحلة", transportType: air ? "AIR" : "LAND", capacity: 10, sarfAmount: air ? 40 : null } });
  const r = await saveTripHotels(user, t.id, [
    { hotelId: h1.id, noHousingPrice: 300, prices: { DOUBLE: 500, TRIPLE: 450 } },
    { hotelId: h2.id, noHousingPrice: null, prices: { DOUBLE: 700 } },
  ], false);
  expect(r.ok).toBe(true);
  return { h1, h2, t };
}
async function book(tripId: string, agentId?: string) {
  const p = await mkPilgrim(agentId);
  await addPilgrimToTrips(db, p.id, agentId ?? null, [tripId], { skipOfficeTrips: [tripId] });
  return db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId } });
}

describe("per-hotel prices", () => {
  it("price follows the Makkah hotel and the room type; the other hotel costs more", async () => {
    const { h1, h2, t } = await setup();
    const b = await book(t.id);
    expect((await applyAccommodation(t.id, b.id, { makkahHotelId: h1.id, roomType: "DOUBLE" })).ok).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBe(500);
    expect((await applyAccommodation(t.id, b.id, { makkahHotelId: h2.id, roomType: "DOUBLE" })).ok).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBe(700);
  });
  it("refuses a hotel not on the trip and a room type without a price — changing nothing", async () => {
    const { h1, h2, t } = await setup();
    const other = await db.hotel.create({ data: { officialName: "Other", city: "MAKKAH" } });
    const b = await book(t.id);
    const r1 = await applyAccommodation(t.id, b.id, { makkahHotelId: other.id, roomType: "DOUBLE" });
    expect(r1.ok).toBe(false);
    const r2 = await applyAccommodation(t.id, b.id, { makkahHotelId: h2.id, roomType: "TRIPLE" });
    expect(r2.ok).toBe(false);
    void h1;
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBeNull();
  });
  it("تصريف المعتمر is added to the price on air trips", async () => {
    const { h1, t } = await setup(true);
    const b = await book(t.id);
    await applyAccommodation(t.id, b.id, { makkahHotelId: h1.id, roomType: "TRIPLE", sarf: "PILGRIM" });
    expect(await db.booking.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ priceAmount: 490, sarfAmount: 40, sarfByPilgrim: true });
    await applyAccommodation(t.id, b.id, { sarf: "COMPANY" });
    expect(await db.booking.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ priceAmount: 450, sarfAmount: 0 });
  });
  it("بدون سكن needs a head of family on the same hotel and uses the fixed price", async () => {
    const { h1, h2, t } = await setup();
    const head = await book(t.id), kid = await book(t.id);
    await applyAccommodation(t.id, head.id, { makkahHotelId: h1.id, roomType: "DOUBLE" });
    expect((await applyAccommodation(t.id, kid.id, { makkahHotelId: h1.id, housing: "NO" })).ok).toBe(false); // no family yet
    const g = await db.familyGroup.create({ data: { kind: "FAMILY" } });
    await db.bookingGroupMember.createMany({ data: [{ bookingId: head.id, groupId: g.id, isHead: true }, { bookingId: kid.id, groupId: g.id }] });
    expect((await applyAccommodation(t.id, kid.id, { makkahHotelId: h2.id, housing: "NO" })).ok).toBe(false); // head is in another hotel / no price
    const ok = await applyAccommodation(t.id, kid.id, { makkahHotelId: h1.id, housing: "NO" });
    expect(ok.ok).toBe(true);
    expect(await db.booking.findUniqueOrThrow({ where: { id: kid.id } })).toMatchObject({ noHousing: true, priceAmount: 300 });
  });
  it("saving prices can re-price existing bookings; a hotel with pilgrims cannot be removed", async () => {
    const { h1, t } = await setup();
    const b = await book(t.id);
    await applyAccommodation(t.id, b.id, { makkahHotelId: h1.id, roomType: "DOUBLE" });
    const r = await saveTripHotels(user, t.id, [{ hotelId: h1.id, noHousingPrice: 300, prices: { DOUBLE: 520 } }], true);
    expect(r).toMatchObject({ ok: true, repriced: 1 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBe(520);
    const bad = await saveTripHotels(user, t.id, [], false);
    expect(bad.ok).toBe(false);
  });
  it("new bookings take the trip's food default", async () => {
    const t = await db.trip.create({ data: { name: "ر", transportType: "LAND", capacity: 5, foodDefault: false } });
    expect((await book(t.id)).withFood).toBe(false);
  });
});

describe("office rooms follow hotel and housing", () => {
  it("different hotels get different office rooms; a no-housing pilgrim joins his head's room without a bed", async () => {
    const { h1, h2, t } = await setup();
    const head = await book(t.id), other = await book(t.id), kid = await book(t.id);
    const g = await db.familyGroup.create({ data: { kind: "FAMILY" } });
    await db.bookingGroupMember.createMany({ data: [{ bookingId: head.id, groupId: g.id, isHead: true }, { bookingId: kid.id, groupId: g.id }] });
    expect((await applyAccommodation(t.id, head.id, { makkahHotelId: h1.id, roomType: "DOUBLE" })).ok).toBe(true);
    expect((await applyAccommodation(t.id, other.id, { makkahHotelId: h2.id, roomType: "DOUBLE" })).ok).toBe(true);
    expect((await applyAccommodation(t.id, kid.id, { makkahHotelId: h1.id, housing: "NO" })).ok).toBe(true);
    const m = async (id: string) => (await db.officeRoomMember.findUniqueOrThrow({ where: { bookingId: id } })).officeRoomId;
    expect(await m(kid.id)).toBe(await m(head.id));
    expect(await m(other.id)).not.toBe(await m(head.id));
    expect((await db.officeRoom.findUniqueOrThrow({ where: { id: await m(head.id) } })).tripHotelId).toBeTruthy();
  });
});

describe("fixed agent commission", () => {
  it("trip amount, per-agent override, unset = 0; cancelled pilgrims earn none", async () => {
    const a = await db.agent.create({ data: { name: "وكيل" } });
    const t = await db.trip.create({ data: { name: "ر", transportType: "LAND", capacity: 5, agentCommission: 50 } });
    const b1 = await book(t.id, a.id), b2 = await book(t.id, a.id), b3 = await book(t.id, a.id);
    for (const b of [b1, b2, b3]) await db.booking.update({ where: { id: b.id }, data: { priceAmount: 1000 } });
    await db.booking.update({ where: { id: b3.id }, data: { status: "CANCELLED" } });
    expect((await agentStatementData(a.id)).sum.commission).toBe(100);
    await db.tripAgentCommission.create({ data: { tripId: t.id, agentId: a.id, amount: 80 } });
    expect((await agentStatementData(a.id)).sum.commission).toBe(160);
    await db.tripAgentCommission.deleteMany(); await db.trip.update({ where: { id: t.id }, data: { agentCommission: null } });
    expect((await agentStatementData(a.id)).sum.commission).toBe(0);
  });
});
