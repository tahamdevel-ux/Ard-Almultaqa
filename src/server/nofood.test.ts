import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { applyAccommodation } from "./accommodation";
import { addPilgrimToTrips } from "./bookings";
import { auditTripPrices, recalcTripPrices } from "./tripHotels";

const user = { id: "u1", username: "a", name: "مدير", role: "ADMIN" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.seatAssignment.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany();
  await db.tripHotelPrice.deleteMany(); await db.tripHotel.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.hotel.deleteMany();
}
beforeEach(wipe); afterAll(wipe);
let n = 0;

async function setup(discount: number | null) {
  const h = await db.hotel.create({ data: { officialName: "Makkah One", city: "MAKKAH" } });
  const t = await db.trip.create({ data: { name: "رحلة", transportType: "LAND", capacity: 10, noFoodDiscount: discount } });
  await db.tripHotel.create({ data: { tripId: t.id, hotelId: h.id, prices: { create: [{ roomType: "DOUBLE", amount: 500 }] } } });
  const mk = async () => {
    const p = await db.pilgrim.create({ data: { motherName: "ام", firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `NF${++n}-X`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
    await addPilgrimToTrips(db, p.id, null, [t.id]);
    return (await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId: t.id } })).id;
  };
  return { h, t, mk };
}

describe("«بدون طعام» discount of the trip", () => {
  it("a pilgrim without food is priced lower by the trip's amount; switching food back and forth follows; a trip without the amount changes nothing", async () => {
    const { h, t, mk } = await setup(25);
    const a = await mk(), b = await mk();
    expect((await applyAccommodation(t.id, a, { makkahHotelId: h.id, roomType: "DOUBLE", food: "1" } as never)).ok).toBe(true);
    expect((await applyAccommodation(t.id, b, { makkahHotelId: h.id, roomType: "DOUBLE", food: "0" } as never)).ok).toBe(true);
    const price = async (id: string) => (await db.booking.findUniqueOrThrow({ where: { id } })).priceAmount;
    expect(await price(a)).toBe(500);
    expect(await price(b)).toBe(475);
    expect((await applyAccommodation(t.id, a, { food: "0" } as never)).ok).toBe(true); // food only: the price follows
    expect(await price(a)).toBe(475);
    expect((await applyAccommodation(t.id, b, { food: "1" } as never)).ok).toBe(true);
    expect(await price(b)).toBe(500);
    // the price table audit does not call a discounted price «different»
    const audit = await auditTripPrices(t.id);
    expect(audit.differs).toBe(0);
    expect(audit.groups).toHaveLength(0);
    // no amount set = no discount
    const { h: h2, t: t2, mk: mk2 } = await setup(null);
    const c = await mk2();
    expect((await applyAccommodation(t2.id, c, { makkahHotelId: h2.id, roomType: "DOUBLE", food: "0" } as never)).ok).toBe(true);
    expect(await price(c)).toBe(500);
  });

  it("a hand-typed price is never touched; raising the discount and re-calculating reprices the pilgrims without food", async () => {
    const { h, t, mk } = await setup(10);
    const a = await mk(), manual = await mk();
    await applyAccommodation(t.id, a, { makkahHotelId: h.id, roomType: "DOUBLE", food: "0" } as never);
    await applyAccommodation(t.id, manual, { makkahHotelId: h.id, roomType: "DOUBLE", food: "0" } as never);
    await db.booking.update({ where: { id: manual }, data: { priceManual: true, priceAmount: 444 } });
    await db.trip.update({ where: { id: t.id }, data: { noFoodDiscount: 30 } });
    await recalcTripPrices(user as never, t.id);
    expect((await db.booking.findUniqueOrThrow({ where: { id: a } })).priceAmount).toBe(470);
    expect((await db.booking.findUniqueOrThrow({ where: { id: manual } })).priceAmount).toBe(444);
  });
});
