import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { TRIP_ORDER, tripChoices } from "./trips";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

describe("trips are ordered by creation time, newest first", () => {
  it("the newest created trip is first even when it is empty or has no dates; departure date never matters", async () => {
    const withDates = await db.trip.create({ data: { name: "قديمة بتواريخ", transportType: "LAND", capacity: 10, departDate: D("2027-05-01"), returnDate: D("2027-05-10"), createdAt: new Date("2026-01-01T10:00:00Z") } });
    const p = await db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: "A12345678", enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
    await db.booking.create({ data: { pilgrimId: p.id, tripId: withDates.id } });
    const noDates = await db.trip.create({ data: { name: "بلا تواريخ", transportType: "AIR", capacity: 10, createdAt: new Date("2026-02-01T10:00:00Z") } });
    const empty = await db.trip.create({ data: { name: "فارغة جديدة", transportType: "LAND", capacity: 10, departDate: D("2026-03-01"), returnDate: D("2026-03-05"), createdAt: new Date("2026-03-01T10:00:00Z") } });

    const list = await db.trip.findMany({ where: { deletedAt: null }, orderBy: TRIP_ORDER });
    expect(list.map((t) => t.id)).toEqual([empty.id, noDates.id, withDates.id]);
    const picker = await tripChoices();
    expect(picker.map((t) => t.id)).toEqual([empty.id, noDates.id, withDates.id]);
  });

  it("trips created at the same instant are ordered by id descending", async () => {
    const at = new Date("2026-04-01T10:00:00Z");
    const a = await db.trip.create({ data: { name: "أ", transportType: "AIR", capacity: 1, createdAt: at } });
    const b = await db.trip.create({ data: { name: "ب", transportType: "AIR", capacity: 1, createdAt: at } });
    const ids = (await db.trip.findMany({ orderBy: TRIP_ORDER })).map((t) => t.id);
    expect(ids).toEqual([a.id, b.id].sort().reverse());
  });
});
