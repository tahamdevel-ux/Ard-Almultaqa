import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { globalSearch } from "./search";
import { normalizeSearch } from "@/domain/searchNorm";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany();
  await db.booking.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany(); await db.hotel.deleteMany();
  await db.session.deleteMany(); await db.user.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

const admin = { id: "a", role: "ADMIN" } as never;

describe("normalizeSearch", () => {
  it("merges Arabic letter variants, tashkeel and digits", () => {
    expect(normalizeSearch("أحمَد إبراهيم")).toBe("احمد ابراهيم");
    expect(normalizeSearch("فاطمة")).toBe(normalizeSearch("فاطمه"));
    expect(normalizeSearch("على")).toBe(normalizeSearch("علي"));
    expect(normalizeSearch("٠٧٧٠١٢٣")).toBe("0770123");
  });
});

describe("global search", () => {
  it("finds pilgrims by Arabic variants, passport and phone, with their trips", async () => {
    const p = await db.pilgrim.create({ data: { firstName: "أحمد", fatherName: "علي", grandfatherName: "حسن", familyName: "الموصلي", gender: "MALE", birthDate: D("1980-01-01"),
      passportNo: "B35364952", phone: "07701234567", enGivenName: "AHMED", enSurname: "ALMOSULI", passportExpiry: D("2032-01-01") } });
    const old = await db.trip.create({ data: { name: "رحلة قديمة", transportType: "LAND", capacity: 5, departDate: D("2020-01-01"), returnDate: D("2020-01-10") } });
    await db.booking.create({ data: { pilgrimId: p.id, tripId: old.id } });
    for (const q of ["احمد", "أحمد الموصلي", "b35364952", "0770123", "ahmed", "٠٧٧٠١٢٣"]) {
      const r = await globalSearch(admin, q);
      expect(r.pilgrims.map((x) => x.id), q).toEqual([p.id]);
    }
    const r = await globalSearch(admin, "احمد");
    expect(r.pilgrims[0].trips[0].past).toBe(true);
    expect((await globalSearch(admin, "غير موجود")).pilgrims).toEqual([]);
    expect((await globalSearch(admin, "رحلة قديمه")).trips).toHaveLength(1);
  });

  it("treats % and _ literally", async () => {
    await db.agent.create({ data: { name: "وكيل" } });
    expect((await globalSearch(admin, "%%")).agents).toEqual([]);
  });

  it("supervisor sees only pilgrims and trips of their own trips; accountant gets no hotels", async () => {
    const sup = await db.user.create({ data: { username: "s1", name: "م", role: "SUPERVISOR", passwordHash: "x" } });
    const mine = await db.trip.create({ data: { name: "رحلتي", transportType: "LAND", capacity: 5, supervisorId: sup.id } });
    const other = await db.trip.create({ data: { name: "رحلتي الأخرى", transportType: "LAND", capacity: 5 } });
    const mk = (no: string, first: string) => db.pilgrim.create({ data: { firstName: first, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: no, enGivenName: "A", enSurname: "B", passportExpiry: D("2032-01-01") } });
    const p1 = await mk("S1", "كريم"); const p2 = await mk("S2", "كريم");
    await db.booking.create({ data: { pilgrimId: p1.id, tripId: mine.id } });
    await db.booking.create({ data: { pilgrimId: p2.id, tripId: other.id } });
    await db.hotel.create({ data: { officialName: "Hotel Rahma", city: "MAKKAH" } });
    const r = await globalSearch({ id: sup.id, role: "SUPERVISOR" } as never, "كريم");
    expect(r.pilgrims.map((x) => x.id)).toEqual([p1.id]);
    expect((await globalSearch({ id: sup.id, role: "SUPERVISOR" } as never, "رحلتي")).trips.map((t) => t.id)).toEqual([mine.id]);
    expect((await globalSearch({ id: "z", role: "ACCOUNTANT" } as never, "rahma")).hotels).toEqual([]);
    expect((await globalSearch(admin, "rahma")).hotels).toHaveLength(1);
  });
});
