import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { addPilgrimToTrips, summarizeAdd } from "./bookings";
import { createPilgrimWithTrips, pilgrimSchema } from "./pilgrims";
import { overlapWarning } from "./trips";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.roomAssignment.deleteMany(); await db.seatAssignment.deleteMany();
  await db.booking.deleteMany(); await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

const trip = (name: string, a?: string, b?: string) => db.trip.create({ data: { name, transportType: "LAND", capacity: 10, departDate: a ? D(a) : null, returnDate: b ? D(b) : null } });
const user = { id: "x", role: "ADMIN" } as never;
const data = (no: string) => pilgrimSchema.parse({
  firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: "01/01/1980",
  passportNo: no, enGivenName: "A", enSurname: "B", passportExpiry: "01/01/2035",
});

describe("pilgrim creation with trips", () => {
  it("requires at least one trip and saves nothing without it", async () => {
    const r = await createPilgrimWithTrips(user, data("A11111111"), []);
    expect(r.fieldErrors?.tripIds).toBeTruthy();
    expect(await db.pilgrim.count()).toBe(0);
  });

  it("creates the pilgrim and all bookings together", async () => {
    const t1 = await trip("أ", "2026-12-01", "2026-12-10"); const t2 = await trip("ب");
    const r = await createPilgrimWithTrips(user, data("A11111112"), [t1.id, t2.id]);
    expect(r.ok).toBe(true);
    expect(await db.booking.count({ where: { pilgrimId: r.id } })).toBe(2);
  });

  it("rolls back the pilgrim if a trip does not exist", async () => {
    const t1 = await trip("أ");
    const r = await createPilgrimWithTrips(user, data("A11111113"), [t1.id, "00000000-0000-0000-0000-000000000000"]);
    expect(r.ok).toBeFalsy();
    expect(await db.pilgrim.count()).toBe(0);
  });
});

describe("adding an existing pilgrim to trips", () => {
  it("allows overlapping trips (warning only) but never the same trip twice", async () => {
    const t1 = await trip("أ", "2026-12-01", "2026-12-10"); const t2 = await trip("ب", "2026-12-05", "2026-12-15"); const t3 = await trip("ج");
    const p = await db.pilgrim.create({ data: { ...data("A11111114"), } as never });
    const r1 = await addPilgrimToTrips(db, p.id, null, [t1.id, t2.id]);
    expect(r1.added).toHaveLength(2);
    expect(await overlapWarning(p.id, t2)).toBeTruthy();
    const r2 = await addPilgrimToTrips(db, p.id, null, [t1.id, t3.id]);
    expect(r2.added).toEqual([t3.id]); expect(r2.skipped).toEqual([t1.id]);
    expect(await db.booking.count({ where: { pilgrimId: p.id } })).toBe(3);
    expect(summarizeAdd(r2)).toContain("أُضيف لـ 1");
  });

  it("reactivates a cancelled booking on the same trip", async () => {
    const t = await trip("أ");
    const p = await db.pilgrim.create({ data: { ...data("A11111115") } as never });
    await db.booking.create({ data: { pilgrimId: p.id, tripId: t.id, status: "CANCELLED", cancelReason: "x", cancelledAt: new Date() } });
    const r = await addPilgrimToTrips(db, p.id, null, [t.id]);
    expect(r.added).toEqual([t.id]);
    expect((await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id } })).status).toBe("ACTIVE");
  });
});
