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
  motherName: "ام", firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: "01/01/1980",
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

describe("changing a pilgrim's agent", () => {
  it("his active bookings follow the new agent (commission moves) and the change is logged", async () => {
    const { updatePilgrim } = await import("./pilgrims");
    const a = await db.agent.create({ data: { name: "أ" } }), b = await db.agent.create({ data: { name: "ب" } });
    const t = await trip("رحلة");
    const p = await db.pilgrim.create({ data: { ...data("A77777771"), agentId: a.id } as never });
    await addPilgrimToTrips(db, p.id, a.id, [t.id]);
    const r = await updatePilgrim({ id: "u", name: "مختبر" } as never, p.id, { ...data("A77777771"), agentId: b.id } as never);
    expect(r.ok).toBe(true);
    expect((await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id } })).agentId).toBe(b.id);
    expect(await db.auditLog.count({ where: { entityId: p.id, field: "agentId" } })).toBe(1);
  });
});

describe("head of family on the new-pilgrim form", () => {
  it("a head creates a family; a member links to him; a head of another trip or a self-link is refused (nothing saved)", async () => {
    const t = await trip("رحلة"), other = await trip("أخرى");
    const head = await createPilgrimWithTrips(user, data("A88888881"), [t.id], {}, { [t.id]: { isHead: true, headOf: "" } });
    expect(head.ok).toBe(true);
    const headBooking = head.bookingIds![t.id];
    const hm = await db.bookingGroupMember.findFirstOrThrow({ where: { bookingId: headBooking }, include: { group: true } });
    expect(hm.isHead).toBe(true); expect(hm.group.kind).toBe("FAMILY");
    const member = await createPilgrimWithTrips(user, data("A88888882"), [t.id], {}, { [t.id]: { isHead: false, headOf: headBooking } });
    expect(member.ok).toBe(true);
    const mm = await db.bookingGroupMember.findFirstOrThrow({ where: { bookingId: member.bookingIds![t.id] } });
    expect(mm.groupId).toBe(hm.groupId); expect(mm.isHead).toBe(false);
    const wrong = await createPilgrimWithTrips(user, data("A88888883"), [other.id], {}, { [other.id]: { isHead: false, headOf: headBooking } });
    expect(wrong.ok).toBeFalsy(); expect(await db.pilgrim.count({ where: { passportNo: "A88888883" } })).toBe(0);
    const both = await createPilgrimWithTrips(user, data("A88888884"), [t.id], {}, { [t.id]: { isHead: true, headOf: headBooking } });
    expect(both.ok).toBeFalsy();
  });
});
