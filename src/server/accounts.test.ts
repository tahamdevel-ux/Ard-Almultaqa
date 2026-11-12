import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { accountsOverview, paymentsLog } from "./accounts";
import { addPayment } from "./payments";

const user = { id: "acc1", username: "acc", name: "المحاسب", role: "ACCOUNTANT" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany();
}
beforeEach(wipe);
afterAll(wipe);

let n = 0;
const pilgrim = (agentId?: string) => db.pilgrim.create({ data: { firstName: `معتمر${++n}`, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"),
  passportNo: `A${String(30000000 + n)}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01"), agentId } });

describe("accounts overview", () => {
  it("totals, per-trip, per-agent (direct vs via agent) and the payments log", async () => {
    const agentA = await db.agent.create({ data: { name: "وكيل أ" } });
    const agentB = await db.agent.create({ data: { name: "وكيل ب" } });
    const t1 = await db.trip.create({ data: { name: "الأولى", transportType: "AIR", capacity: 10, agentCommission: 100, createdAt: new Date("2026-01-01T00:00:00Z") } });
    const t2 = await db.trip.create({ data: { name: "الثانية (فارغة)", transportType: "AIR", capacity: 10, createdAt: new Date("2026-02-01T00:00:00Z") } });
    const [p1, p2, p3] = [await pilgrim(agentA.id), await pilgrim(agentA.id), await pilgrim()];
    const mk = (pid: string, price: number, agentId: string | null) => db.booking.create({ data: { pilgrimId: pid, tripId: t1.id, agentId, priceAmount: price } });
    const b1 = await mk(p1.id, 1000, agentA.id), b2 = await mk(p2.id, 1000, agentA.id), b3 = await mk(p3.id, 500, null);
    // b1: 600 direct; b2: 400 through agent A; b3: cancelled after paying 100 (kept)
    expect((await addPayment(user, b1.id, { kind: "PAYMENT", amount: 600, currency: "USD", method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(true);
    expect((await addPayment(user, b2.id, { kind: "PAYMENT", amount: 400, currency: "USD", method: "CASH", paidAt: D("2026-10-02"), source: "AGENT", sourceAgentId: agentA.id })).ok).toBe(true);
    expect((await addPayment(user, b3.id, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-03") })).ok).toBe(true);
    await db.booking.update({ where: { id: b3.id }, data: { status: "CANCELLED" } });
    expect((await addPayment(user, b1.id, { kind: "REFUND", amount: 50, currency: "USD", method: "CASH", paidAt: D("2026-10-04"), reason: "اختبار" })).ok).toBe(true);

    const o = await accountsOverview({ period: "all" });
    expect(o.totals).toMatchObject({ due: 2000, received: 1050, remaining: 950 }); // 550 + 400 + 100
    expect(o.totals.commission).toBe(200);
    expect(o.tripRows.map((r) => r.trip.id)).toEqual([t1.id]); // the empty trip has no bookings → no row
    expect(o.tripRows[0]).toMatchObject({ pilgrims: 2, due: 2000, received: 1050 });
    const a = o.agentRows.find((r) => r.agent.id === agentA.id)!;
    expect(a).toMatchObject({ pilgrims: 2, due: 2000, viaAgent: 400, direct: 550, remaining: 1050 });
    expect(o.agentRows.find((r) => r.agent.id === agentB.id)).toBeUndefined();
    expect((await accountsOverview({ period: "all", onlyDue: true })).pilgrimRows.every((r) => r.remaining > 0)).toBe(true);
    expect((await accountsOverview({ period: "all", agent: agentA.id })).pilgrimRows).toHaveLength(2);
    expect((await accountsOverview({ period: "all", trip: t2.id })).pilgrimRows).toHaveLength(0);

    const { rows: log, totals } = await paymentsLog("all");
    expect(totals.net).toBe(totals.received - totals.refunded);
    expect(log.map((p) => p.source)).toEqual(["DIRECT", "DIRECT", "AGENT", "DIRECT"]); // newest first: refund, b3, b2(agent), b1
    expect(log.find((p) => p.source === "AGENT")!.agentName).toBe("وكيل أ");
    expect((await paymentsLog("all", String(log[0].receiptNo))).rows.length).toBe(1);
    expect((await paymentsLog("all", "معتمر" + n)).rows.length).toBeGreaterThanOrEqual(1);
  });

  it("the payments log is paged and its totals cover every matching payment, not only the visible page", async () => {
    const t = await db.trip.create({ data: { name: "ر", transportType: "AIR", capacity: 1 } });
    const b = await db.booking.create({ data: { pilgrimId: (await pilgrim()).id, tripId: t.id, priceAmount: 100000 } });
    const base = { bookingId: b.id, currency: "USD" as const, method: "CASH" as const, paidAt: D("2026-10-01"), receivedById: "u", receivedByName: "u" };
    await db.payment.createMany({ data: [
      ...Array.from({ length: 104 }, () => ({ ...base, kind: "PAYMENT" as const, amount: 10, credited: 10 })),
      { ...base, kind: "REFUND" as const, amount: 40, credited: 40, reason: "x" },
    ] });
    const p1 = await paymentsLog("all");
    expect(p1).toMatchObject({ count: 105, page: 1, pages: 2, totals: { received: 1040, refunded: 40, net: 1000 } });
    expect(p1.rows).toHaveLength(100);
    const p2 = await paymentsLog("all", undefined, 2);
    expect(p2.rows).toHaveLength(5); expect(p2.totals).toEqual(p1.totals);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(105);
    expect((await paymentsLog("all", undefined, 99)).page).toBe(2); // out of range -> last page
  });

  it("an agent payment needs an existing agent", async () => {
    const t = await db.trip.create({ data: { name: "ر", transportType: "AIR", capacity: 1 } });
    const b = await db.booking.create({ data: { pilgrimId: (await pilgrim()).id, tripId: t.id, priceAmount: 100 } });
    const r = await addPayment(user, b.id, { kind: "PAYMENT", amount: 10, currency: "USD", method: "CASH", paidAt: D("2026-10-01"), source: "AGENT" });
    expect(r.ok).toBe(false);
  });

  it("the period filter works by trip creation date and by payment date", async () => {
    const old = await db.trip.create({ data: { name: "قديمة", transportType: "AIR", capacity: 1, createdAt: new Date("2020-01-01T00:00:00Z") } });
    const b = await db.booking.create({ data: { pilgrimId: (await pilgrim()).id, tripId: old.id, priceAmount: 100 } });
    await addPayment(user, b.id, { kind: "PAYMENT", amount: 10, currency: "USD", method: "CASH", paidAt: D("2020-01-02") });
    expect((await accountsOverview({ period: "3m" })).tripRows).toHaveLength(0);
    expect((await accountsOverview({ period: "all" })).tripRows).toHaveLength(1);
    expect((await paymentsLog("month")).rows).toHaveLength(0);
    expect((await paymentsLog("all")).rows).toHaveLength(1);
  });
});
