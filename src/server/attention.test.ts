import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { attentionCounts } from "./attention";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany();
  await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
}
beforeEach(wipe); afterAll(wipe);
let n = 0;
const mk = (expiry: string) => db.pilgrim.create({ data: { motherName: "ام", firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `AT${++n}-${Date.now()}`, enGivenName: "A", enSurname: "B", passportExpiry: D(expiry) } });

describe("dashboard attention counts", () => {
  it("counts expiring passports, bookings without room or price, and trips over capacity", async () => {
    const t = await db.trip.create({ data: { name: "ر", transportType: "AIR", capacity: 1 } });
    const soon = await mk("2026-12-01"), fine = await mk("2040-01-01");
    for (const p of [soon, fine]) await db.booking.create({ data: { pilgrimId: p.id, tripId: t.id } });
    const c = await attentionCounts({ rooms: true, money: true });
    expect(c).toEqual({ expiring: 1, noRoom: 2, noPrice: 2, overCapacity: 1 });
    expect(await attentionCounts({ rooms: false, money: false })).toMatchObject({ noRoom: null, noPrice: null });
  });
  it("ignores cancelled bookings and archived trips", async () => {
    const t = await db.trip.create({ data: { name: "ر", transportType: "AIR", capacity: 5, archivedAt: new Date() } });
    const p = await mk("2026-12-01");
    await db.booking.create({ data: { pilgrimId: p.id, tripId: t.id, status: "CANCELLED" } });
    expect(await attentionCounts({ rooms: true, money: true })).toEqual({ expiring: 0, noRoom: 0, noPrice: 0, overCapacity: 0 });
  });
});
