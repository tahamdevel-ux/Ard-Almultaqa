import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { loadTripDetail, overlapWarning } from "./trips";
import { auditChanges } from "./audit";
import { manifestData, flightListData, roomingData, agentStatementData } from "@/outputs/viewmodels";
import { dateOrNotSet, dateRangeLabel, tripLabel } from "@/lib/tripLabel";
import { joinMeta, tripMetaParts } from "@/outputs/meta";

const D = (s: string) => new Date(s + "T00:00:00Z");
const BAD = /null|undefined|NaN|Invalid Date|1970/;

async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.roomAssignment.deleteMany(); await db.seatAssignment.deleteMany();
  await db.booking.deleteMany(); await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

async function pilgrim(no: string, agentId?: string) {
  return db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"),
    passportNo: no, enGivenName: "A", enSurname: "B", passportExpiry: D("2026-12-01"), agentId } });
}

describe("trips without a code and without dates", () => {
  it("can be created many times; a filled code stays unique", async () => {
    const mk = (tripNo: string | null) => db.trip.create({ data: { tripNo, name: "عمرة بري - قافلة الأحد", transportType: "LAND", capacity: 10 } });
    await mk(null); await mk(null);
    expect(await db.trip.count({ where: { tripNo: null, departDate: null, returnDate: null } })).toBe(2);
    await mk("L-1");
    await expect(mk("L-1")).rejects.toMatchObject({ code: "P2002" });
  });

  it("detail page data loads, with no passport or overlap warnings", async () => {
    const a = await db.trip.create({ data: { tripNo: null, name: "رحلة أ", transportType: "LAND", capacity: 10 } });
    const other = await db.trip.create({ data: { tripNo: "X1", name: "رحلة ب", transportType: "LAND", capacity: 10, departDate: D("2026-11-01"), returnDate: D("2026-11-10") } });
    const p = await pilgrim("N1");
    await db.booking.create({ data: { pilgrimId: p.id, tripId: a.id } });
    await db.booking.create({ data: { pilgrimId: p.id, tripId: other.id } });
    const d = await loadTripDetail(a.id);
    expect(d!.rows).toHaveLength(1);
    expect(d!.rows[0].warnings).toEqual([]); // passport expires 2026-12-01 but the trip has no return date; no overlap without dates
    expect(await overlapWarning(p.id, a)).toBeNull();
    expect(await overlapWarning(p.id, { id: "00000000-0000-0000-0000-000000000000", departDate: D("2026-11-05"), returnDate: null })).toBeNull();
  });

  it("overlap and passport warnings still work for dated trips", async () => {
    const t1 = await db.trip.create({ data: { tripNo: "T1", name: "a", transportType: "LAND", capacity: 5, departDate: D("2026-11-01"), returnDate: D("2026-11-10") } });
    const t2 = await db.trip.create({ data: { tripNo: "T2", name: "b", transportType: "LAND", capacity: 5, departDate: D("2026-11-05"), returnDate: D("2026-11-20") } });
    const p = await pilgrim("N2");
    await db.booking.create({ data: { pilgrimId: p.id, tripId: t1.id } });
    expect(await overlapWarning(p.id, t2)).toContain("T1");
    const d = await loadTripDetail(t2.id);
    expect(d!.rows).toHaveLength(0);
    await db.booking.create({ data: { pilgrimId: p.id, tripId: t2.id } });
    const d2 = await loadTripDetail(t2.id);
    expect(d2!.rows[0].warnings.join(" ")).toContain("T1");
    expect(d2!.rows[0].warnings.join(" ")).toContain("جواز"); // passport expires before return + 6 months
  });

  it("labels and date helpers never print null, NaN or 1970", () => {
    expect(tripLabel({ tripNo: null, name: "قافلة الأحد" })).toBe("قافلة الأحد");
    expect(tripLabel({ tripNo: "L-1", name: "قافلة" })).toBe("L-1 — قافلة");
    expect(dateOrNotSet(null)).toBe("غير محدد");
    expect(dateRangeLabel(null, null)).toBe("التواريخ غير محددة");
    expect(dateRangeLabel(D("2026-11-15"), null)).toBe("15/11/2026 ← غير محدد");
    for (const s of [dateOrNotSet(null), dateRangeLabel(null, null), dateRangeLabel(null, D("2026-11-15")), tripLabel({ tripNo: null, name: "x" })]) expect(s).not.toMatch(BAD);
    expect(joinMeta(tripMetaParts({ tripNo: null, name: "قافلة", departDate: null }))).toBe("قافلة");
  });

  it("every output's data and header lines are clean for a trip with no code and no dates", async () => {
    const agent = await db.agent.create({ data: { name: "وكيل", commissionType: "PERCENT", commissionValue: 5 } });
    const hotel = await db.hotel.create({ data: { officialName: "Hotel", city: "MAKKAH" } });
    const trip = await db.trip.create({ data: { tripNo: null, name: "عمرة بري - قافلة الأحد", transportType: "LAND", capacity: 10, makkahHotelId: hotel.id } });
    const bus = await db.bus.create({ data: { tripId: trip.id, number: "1", seatCount: 48 } });
    await db.flight.create({ data: { tripId: trip.id, flightNo: "IA 1" } });
    const p = await pilgrim("N3", agent.id);
    const b = await db.booking.create({ data: { pilgrimId: p.id, tripId: trip.id, agentId: agent.id, priceAmount: 1000, priceCurrency: "USD" } });
    await db.seatAssignment.create({ data: { bookingId: b.id, busId: bus.id, seatNo: 1 } });
    const room = await db.room.create({ data: { tripId: trip.id, hotelId: hotel.id, city: "MAKKAH", roomNo: "501", type: "DOUBLE", beds: 2 } });
    await db.roomAssignment.create({ data: { roomId: room.id, bookingId: b.id, city: "MAKKAH" } });

    const m = await manifestData(trip.id, bus.id);
    const f = await flightListData(trip.id);
    const rm = await roomingData(trip.id, "MAKKAH");
    const ag = await agentStatementData(agent.id);
    expect(m.meta).toBe("عمرة بري - قافلة الأحد");
    expect(f.meta).toContain("IA 1");
    expect(rm.checkIn).toBe(""); expect(rm.checkOut).toBe("");
    expect(ag.rows).toHaveLength(1);
    for (const text of [m.title, m.meta, f.title, f.meta, rm.checkIn, rm.checkOut, rm.hotelAr]) expect(text).not.toMatch(BAD);
  });

  it("filling or clearing the three fields is written to the audit log", async () => {
    const trip = await db.trip.create({ data: { tripNo: "L-9", name: "x", transportType: "LAND", capacity: 1, departDate: D("2026-11-15"), returnDate: D("2026-11-27") } });
    const user = { id: "u1", name: "مدير" };
    const run = (data: { tripNo: string | null; departDate: Date | null; returnDate: Date | null }) => db.$transaction(async (tx) => {
      const before = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      const after = await tx.trip.update({ where: { id: trip.id }, data });
      await auditChanges(tx, user, "Trip", trip.id, before, after, ["tripNo", "departDate", "returnDate"]);
    });
    await run({ tripNo: null, departDate: null, returnDate: null }); // clear all three
    await run({ tripNo: "L-10", departDate: D("2026-12-01"), returnDate: null }); // fill two
    const logs = await db.auditLog.findMany({ where: { entityId: trip.id }, orderBy: { at: "asc" } });
    expect(logs.map((l) => `${l.field}:${l.oldValue}->${l.newValue}`).sort()).toEqual([
      "departDate:2026-11-15->null", "departDate:null->2026-12-01", "returnDate:2026-11-27->null", "tripNo:L-9->null", "tripNo:null->L-10",
    ].sort());
  });
});
