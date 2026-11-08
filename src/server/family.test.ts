import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { addFamilyPayment, familyAccount } from "./payments";

const user = { id: "acc1", username: "acc", name: "المحاسب", role: "ACCOUNTANT" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany();
  await db.booking.deleteMany(); await db.bus.deleteMany(); await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

async function family(prices: (number | null)[]) {
  const trip = await db.trip.create({ data: { name: "رحلة", transportType: "AIR", capacity: 20 } });
  const g = await db.familyGroup.create({ data: { kind: "FAMILY" } });
  const ids: string[] = [];
  for (let i = 0; i < prices.length; i++) {
    const p = await db.pilgrim.create({ data: { firstName: `فرد${i}`, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `F${i}-${Date.now()}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2032-01-01") } });
    const b = await db.booking.create({ data: { pilgrimId: p.id, tripId: trip.id, priceAmount: prices[i], priceCurrency: "USD" } });
    await db.bookingGroupMember.create({ data: { bookingId: b.id, groupId: g.id, isHead: i === 0 } });
    ids.push(b.id);
  }
  return { g, ids };
}

describe("family account", () => {
  it("sums prices and payments of all members, head first", async () => {
    const { g, ids } = await family([1000, 800, 800]);
    await addFamilyPayment(user, g.id, { amount: 500, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    const a = (await familyAccount(g.id))!;
    expect(a.members[0].isHead).toBe(true);
    expect(a.totals).toEqual([{ currency: "USD", price: 2600, paid: 500, balance: 2100 }]);
    expect(a.members.find((m) => m.bookingId === ids[0])!.paid).toBe(500); // head's own balance takes it first
  });

  it("splits a payment over members up to what each owes; every member gets his own receipt", async () => {
    const { g, ids } = await family([1000, 800, 800]);
    const r = await addFamilyPayment(user, g.id, { amount: 1500, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    expect(r.ok).toBe(true);
    const pays = await db.payment.findMany({ where: { bookingId: { in: ids } }, orderBy: { receiptNo: "asc" } });
    expect(pays.map((p) => p.amount)).toEqual([1000, 500]);
    expect(new Set(pays.map((p) => p.receiptNo)).size).toBe(2);
  });

  it("refuses more than the family still owes", async () => {
    const { g } = await family([100, 100]);
    expect((await addFamilyPayment(user, g.id, { amount: 201, currency: "USD", method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(false);
    expect(await db.payment.count()).toBe(0);
  });

  it("dinar payments at a rate are converted and split", async () => {
    const { g } = await family([100, 100]);
    const r = await addFamilyPayment(user, g.id, { amount: 210000, currency: "IQD", rate: 1400, method: "CASH", paidAt: D("2026-10-01") }); // = $150
    expect(r.ok).toBe(true);
    const a = (await familyAccount(g.id))!;
    expect(a.totals[0].paid).toBe(150);
    expect((await addFamilyPayment(user, g.id, { amount: 5000, currency: "IQD", method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(false); // no rate
  });
});
