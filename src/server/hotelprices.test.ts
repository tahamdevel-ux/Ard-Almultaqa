import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { applyAccommodation } from "./accommodation";
import { addPilgrimToTrips } from "./bookings";
import { setBookingPrice } from "./payments";
import { auditTripPrices, recalcTripPrices, saveTripHotels } from "./tripHotels";
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

describe("manual prices survive", () => {
  it("a price typed by hand is not overwritten by saving the accommodation again or by re-pricing", async () => {
    const { h1, t } = await setup();
    const head = await book(t.id), wife = await book(t.id);
    for (const b of [head, wife]) await applyAccommodation(t.id, b.id, { makkahHotelId: h1.id, roomType: "DOUBLE" });
    // agreed 425 each (850 for the couple) instead of the table's 500
    for (const b of [head, wife]) expect((await setBookingPrice(user, b.id, { roomType: "DOUBLE", amount: 425, currency: "USD" })).ok).toBe(true);
    // saving the accommodation again (role / room label / same hotel) must not reset the price
    await applyAccommodation(t.id, head.id, { makkahHotelId: h1.id, roomType: "DOUBLE", tripRole: "CONTRACTOR" });
    await applyAccommodation(t.id, wife.id, { makkahHotelId: h1.id, roomType: "DOUBLE", food: "0" });
    // and a table change with "apply to existing" leaves hand-priced bookings alone
    const r = await saveTripHotels(user, t.id, [{ hotelId: h1.id, noHousingPrice: 300, prices: { DOUBLE: 600 } }], true);
    expect(r).toMatchObject({ ok: true, repriced: 0 });
    for (const b of [head, wife]) expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBe(425);
    // leaving the amount empty means "use the table again"
    await setBookingPrice(user, head.id, { roomType: "DOUBLE", amount: null, currency: "USD" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: head.id } })).priceAmount).toBe(600);
  });
  it("«سعر الرحلة الافتراضي» on the booking page uses the hotel table (with تصريف), not an old price list", async () => {
    const { h1, t } = await setup(true);
    await db.tripPrice.create({ data: { tripId: t.id, roomType: "DOUBLE", currency: "USD", amount: 9999 } }); // stale legacy row
    const b = await book(t.id);
    await applyAccommodation(t.id, b.id, { makkahHotelId: h1.id, roomType: "DOUBLE", sarf: "PILGRIM" });
    await setBookingPrice(user, b.id, { roomType: "DOUBLE", amount: null, currency: "USD" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBe(540);
  });
});

describe("prices come only from an explicit hotel", () => {
  it("a partial save keeps the hotel and the price", async () => {
    const { h2, t } = await setup();
    const b = await book(t.id);
    await applyAccommodation(t.id, b.id, { makkahHotelId: h2.id, roomType: "DOUBLE" });
    await applyAccommodation(t.id, b.id, { tripRole: "" });
    await applyAccommodation(t.id, b.id, { officeRoom: "7" });
    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { tripHotel: true } });
    expect(after.tripHotel?.hotelId).toBe(h2.id);
    expect(after.priceAmount).toBe(700);
  });
  it("never prices from the trip's old default hotel: with several hotels and none chosen it asks", async () => {
    const { h1, t } = await setup();
    await db.trip.update({ where: { id: t.id }, data: { makkahHotelId: h1.id } }); // the old trip-level hotel
    const b = await book(t.id);
    const r = await applyAccommodation(t.id, b.id, { roomType: "DOUBLE" });
    expect(r.ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).priceAmount).toBeNull();
  });
  it("«أعد حساب الأسعار»: gives the only hotel to a booking without one, prices it, keeps hand-typed prices, reports the rest", async () => {
    const h = await db.hotel.create({ data: { officialName: "Only", city: "MAKKAH" } });
    const t = await db.trip.create({ data: { name: "ر", transportType: "LAND", capacity: 9 } });
    await saveTripHotels(user, t.id, [{ hotelId: h.id, noHousingPrice: null, prices: { DOUBLE: 850 } }], false);
    const a = await book(t.id), m = await book(t.id), c = await book(t.id);
    await db.booking.update({ where: { id: a.id }, data: { roomType: "DOUBLE" } }); // added before the table existed: has a room type, no hotel, no price
    await db.booking.update({ where: { id: m.id }, data: { roomType: "DOUBLE", priceAmount: 777, priceManual: true } });
    expect(await auditTripPrices(t.id)).toMatchObject({ noPrice: 2, manual: 1 });
    const r = await recalcTripPrices(user, t.id);
    expect(r).toMatchObject({ updated: 1, skippedManual: 1, noRoomType: 1 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: a.id } })).priceAmount).toBe(850);
    expect((await db.booking.findUniqueOrThrow({ where: { id: m.id } })).priceAmount).toBe(777);
    expect((await db.booking.findUniqueOrThrow({ where: { id: c.id } })).priceAmount).toBeNull();
    expect(await auditTripPrices(t.id)).toMatchObject({ noPrice: 1, differs: 0 });
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
