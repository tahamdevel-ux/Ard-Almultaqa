import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { tripChoices } from "./trips";
import { addPilgrimToTrips } from "./bookings";
import { accountsOverview } from "./accounts";
import { globalSearch } from "./search";
import { can, ROLE_PERMISSIONS, type Role } from "@/lib/permissions";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany();
  await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

describe("trip archive", () => {
  it("archived trips are hidden from pickers and search, take no new pilgrims, but stay in accounts unless hidden", async () => {
    const live = await db.trip.create({ data: { name: "حية", transportType: "AIR", capacity: 5 } });
    const old = await db.trip.create({ data: { name: "قديمة مؤرشفة", transportType: "AIR", capacity: 5, archivedAt: new Date() } });
    const p = await db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", motherName: "م", gender: "MALE", birthDate: D("1980-01-01"), passportNo: "A99999991", enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
    await db.booking.create({ data: { pilgrimId: p.id, tripId: old.id, priceAmount: 500 } });
    expect((await tripChoices()).map((t) => t.id)).toEqual([live.id]);
    const r = await addPilgrimToTrips(db, p.id, null, [old.id]);
    expect(r.added).toEqual([]); expect(r.missing).toEqual([old.id]); // an archived trip takes no new pilgrims
    const admin = { id: "a", role: "ADMIN" } as never;
    expect((await globalSearch(admin, "قديمة")).trips).toHaveLength(0);
    expect((await accountsOverview({ period: "all" })).totals.due).toBe(500); // still counted
    expect((await accountsOverview({ period: "all", hideArchived: true })).totals.due).toBe(0);
    expect(await db.booking.count({ where: { tripId: old.id } })).toBe(1); // nothing is deleted
  });

  it("only admin and accountant archive; only admin unarchives", () => {
    for (const r of Object.keys(ROLE_PERMISSIONS) as Role[]) {
      expect(can(r, "trips.archive"), r).toBe(r === "ADMIN" || r === "ACCOUNTANT");
      expect(can(r, "trips.unarchive"), r).toBe(r === "ADMIN");
    }
  });
});
