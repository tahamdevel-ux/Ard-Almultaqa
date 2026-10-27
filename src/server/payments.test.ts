import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { addPayment, cancelBooking, moveToTrip, setBookingPrice } from "./payments";

const user = { id: "acc1", username: "acc", name: "المحاسب", role: "ACCOUNTANT" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
let bookingId: string, tripA: string, tripB: string;

beforeEach(async () => {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
  const p = await db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: "P1", enGivenName: "A", enSurname: "B", passportExpiry: D("2032-01-01") } });
  const mk = (no: string) => db.trip.create({ data: { tripNo: no, name: no, transportType: "LAND", departDate: D("2026-11-01"), returnDate: D("2026-11-10"), capacity: 10 } });
  tripA = (await mk("TA")).id; tripB = (await mk("TB")).id;
  await db.tripPrice.create({ data: { tripId: tripA, roomType: "QUAD", currency: "USD", amount: 1500 } });
  bookingId = (await db.booking.create({ data: { pilgrimId: p.id, tripId: tripA } })).id;
});

describe("payments", () => {
  it("uses the trip's default price for a room type and audits it", async () => {
    expect((await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: null, currency: "USD" })).ok).toBe(true);
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.priceAmount).toBe(1500);
    expect(await db.auditLog.count({ where: { entity: "Booking", field: "priceAmount" } })).toBe(1);
  });
  it("issues sequential receipt numbers and refuses wrong currency / no price", async () => {
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(false); // no price yet
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000, currency: "USD" });
    const a = await addPayment(user, bookingId, { kind: "PAYMENT", amount: 400, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    const b = await addPayment(user, bookingId, { kind: "PAYMENT", amount: 140000, currency: "IQD", rate: 1400, method: "TRANSFER", paidAt: D("2026-10-02") });
    expect(a.ok && b.ok && b.receiptNo! > a.receiptNo!).toBe(true);
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 5000, currency: "IQD", method: "CASH", paidAt: D("2026-10-02") })).ok).toBe(false); // dinars without a rate
    const row = await db.payment.findUniqueOrThrow({ where: { id: (b as { id: string }).id } });
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 9999, currency: "USD", method: "CASH", paidAt: D("2026-10-02") })).ok).toBe(false); // more than remaining
    expect(Number(row.credited)).toBe(100); expect(row.exchangeRate).toBe(1400); expect(row.amount).toBe(140000);
    expect(await db.auditLog.count({ where: { entity: "Payment", field: "amount" } })).toBe(2);
  });
  it("cancel with refund frees seat and records the refund", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000, currency: "USD" });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 500, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    await db.seatAssignment.create({ data: { bookingId, ticketNo: "T1" } });
    expect((await cancelBooking(user, bookingId, "")).ok).toBe(false);
    const r = await cancelBooking(user, bookingId, "ظرف صحي", { amount: 300, method: "CASH", paidAt: D("2026-10-05") });
    expect(r.ok).toBe(true);
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true, seat: true } });
    expect(b.status).toBe("CANCELLED"); expect(b.seat).toBeNull();
    expect(b.payments.filter((p) => p.kind === "REFUND")[0]).toMatchObject({ amount: 300, reason: "ظرف صحي" });
    expect((await cancelBooking(user, bookingId, "x")).ok).toBe(false);
  });
  it("refund cannot exceed what was paid", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000, currency: "USD" });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    expect((await cancelBooking(user, bookingId, "x", { amount: 200, method: "CASH", paidAt: D("2026-10-05") })).ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ACTIVE");
  });
  it("move keeps price, payments and history", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000, currency: "USD" });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 250, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    const r = await moveToTrip(user, bookingId, tripB);
    expect(r.ok).toBe(true);
    const old = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(old.status).toBe("MOVED");
    const nb = await db.booking.findFirstOrThrow({ where: { tripId: tripB }, include: { payments: true } });
    expect(nb.movedFromId).toBe(bookingId); expect(nb.priceAmount).toBe(1000); expect(nb.payments.length).toBe(1);
    expect((await moveToTrip(user, bookingId, tripB)).ok).toBe(false);
  });
});

afterAll(async () => {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
});
