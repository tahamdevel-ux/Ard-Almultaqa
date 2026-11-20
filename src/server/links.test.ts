import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { linkBookings, unlinkBookings, loadLinks } from "./links";

const D = (s: string) => new Date(s + "T00:00:00Z");
const u = { id: "u1", name: "موظف" };
async function wipe() {
  await db.bookingLinkMember.deleteMany(); await db.bookingLink.deleteMany(); await db.auditLog.deleteMany();
  await db.booking.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
}
beforeEach(wipe); afterAll(wipe);
let n = 0;
async function setup(count: number) {
  const t = await db.trip.create({ data: { name: "رحلة", transportType: "LAND", capacity: 50 } });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = await db.pilgrim.create({ data: { firstName: `م${++n}`, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `A${70000000 + n}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
    ids.push((await db.booking.create({ data: { pilgrimId: p.id, tripId: t.id } })).id);
  }
  return { t, ids };
}

describe("«ارتباط»", () => {
  it("any number of pilgrims share one link and one colour; a second link gets another colour", async () => {
    const { t, ids } = await setup(6);
    expect((await db.$transaction((tx) => linkBookings(tx, u, t.id, ids.slice(0, 3), "أخوة"))).ok).toBe(true);
    expect((await db.$transaction((tx) => linkBookings(tx, u, t.id, ids.slice(3, 5), null))).ok).toBe(true);
    const m = await loadLinks(t.id);
    expect(m.size).toBe(5);
    expect(new Set([ids[0], ids[1], ids[2]].map((i) => m.get(i)!.linkId)).size).toBe(1);
    expect(m.get(ids[0])!.with).toHaveLength(2);
    expect(m.get(ids[0])!.note).toBe("أخوة");
    expect(m.get(ids[0])!.colorIdx).not.toBe(m.get(ids[3])!.colorIdx);
    expect(m.has(ids[5])).toBe(false);
  });
  it("linking people who already have links merges them into one", async () => {
    const { t, ids } = await setup(4);
    await db.$transaction((tx) => linkBookings(tx, u, t.id, [ids[0], ids[1]], null));
    await db.$transaction((tx) => linkBookings(tx, u, t.id, [ids[2], ids[3]], null));
    await db.$transaction((tx) => linkBookings(tx, u, t.id, [ids[1], ids[2]], null));
    const m = await loadLinks(t.id);
    expect(new Set(ids.map((i) => m.get(i)!.linkId)).size).toBe(1);
    expect(await db.bookingLink.count({ where: { tripId: t.id } })).toBe(1);
  });
  it("needs two; unlinking until fewer than two are left removes the link; cancelled members drop out", async () => {
    const { t, ids } = await setup(3);
    expect((await db.$transaction((tx) => linkBookings(tx, u, t.id, [ids[0]], null))).ok).toBe(false);
    await db.$transaction((tx) => linkBookings(tx, u, t.id, ids, null));
    await db.booking.update({ where: { id: ids[2] }, data: { status: "CANCELLED" } });
    expect((await loadLinks(t.id)).get(ids[0])!.with).toHaveLength(1);
    await db.$transaction((tx) => unlinkBookings(tx, u, t.id, [ids[0]]));
    expect((await loadLinks(t.id)).size).toBe(0);
    expect(await db.bookingLink.count()).toBe(1); // ids[1] + the cancelled one remain stored, but it is not shown (fewer than two live members)
  });
});
