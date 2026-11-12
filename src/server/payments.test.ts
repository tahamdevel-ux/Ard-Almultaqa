import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { addPayment, addPaymentTx, cancelBooking, moveToTrip, setBookingPrice } from "./payments";
import { balance } from "@/domain/money";

const user = { id: "acc1", username: "acc", name: "المحاسب", role: "ACCOUNTANT" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
let bookingId: string, tripA: string, tripB: string;

beforeEach(async () => {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
  const p = await db.pilgrim.create({ data: { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: "P1", enGivenName: "A", enSurname: "B", passportExpiry: D("2032-01-01") } });
  const mk = (no: string) => db.trip.create({ data: { tripNo: no, name: no, transportType: "LAND", departDate: D("2026-11-01"), returnDate: D("2026-11-10"), capacity: 10 } });
  tripA = (await mk("TA")).id; tripB = (await mk("TB")).id;
  bookingId = (await db.booking.create({ data: { pilgrimId: p.id, tripId: tripA } })).id;
});

describe("payments", () => {
  it("an empty price comes from the booking's hotel table and is audited", async () => {
    const hotel = await db.hotel.create({ data: { officialName: "H", city: "MAKKAH" } });
    const th = await db.tripHotel.create({ data: { tripId: tripA, hotelId: hotel.id, prices: { create: [{ roomType: "QUAD", amount: 1500 }] } } });
    await db.booking.update({ where: { id: bookingId }, data: { tripHotelId: th.id } });
    expect((await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: null })).ok).toBe(true);
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.priceAmount).toBe(1500); expect(b.priceManual).toBe(false);
    expect(await db.auditLog.count({ where: { entity: "Booking", field: "priceAmount" } })).toBe(1);
    await db.tripHotel.deleteMany({ where: { tripId: tripA } });
  });
  it("an empty price with no priced hotel is refused (the old per-trip price list is no longer read)", async () => {
    await db.tripPrice.create({ data: { tripId: tripA, roomType: "QUAD", currency: "USD", amount: 1500 } }); // stale legacy row
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 900 });
    const r = await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: null });
    expect(r.ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).priceAmount).toBe(900); // untouched
  });
  it("a receipt keeps the trip and price of the day it was issued, also after the pilgrim moves", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    const a = await addPayment(user, bookingId, { kind: "PAYMENT", amount: 250, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    const moved = await moveToTrip(user, bookingId, tripB);
    if (!moved.ok) throw new Error(moved.error);
    const newId = moved.id!;
    await setBookingPrice(user, newId, { roomType: "QUAD", amount: 1200 });
    const b = await addPayment(user, newId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-02") });
    if (!a.ok || !b.ok) throw new Error("payment failed");
    const pa = await db.payment.findUniqueOrThrow({ where: { receiptNo: a.receiptNo! } });
    const pb = await db.payment.findUniqueOrThrow({ where: { receiptNo: b.receiptNo! } });
    expect(pa).toMatchObject({ tripId: tripA, bookingPrice: 1000, bookingId: newId }); // re-pointed, but still describes trip A
    expect(pb).toMatchObject({ tripId: tripB, bookingPrice: 1200 });
  });

  it("issues sequential receipt numbers and refuses wrong currency / no price", async () => {
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(false); // no price yet
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
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
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
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
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    expect((await cancelBooking(user, bookingId, "x", { amount: 200, method: "CASH", paidAt: D("2026-10-05") })).ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ACTIVE");
  });
  it("rejects a fractional exchange rate with a message instead of crashing", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    const r = await addPayment(user, bookingId, { kind: "PAYMENT", amount: 145000, currency: "IQD", rate: 1450.5, method: "CASH", paidAt: D("2026-10-01") });
    expect(r.ok).toBe(false);
    expect(await db.payment.count()).toBe(0);
  });
  it("a payment waits for a concurrent change on the same booking and re-reads the balance", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => (locked = r));
    // transaction A: pays 800 and keeps the transaction open
    const a = db.$transaction(async (tx) => {
      const r = await addPaymentTx(tx, user, bookingId, { kind: "PAYMENT", amount: 800, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
      locked(); await held; return r;
    });
    await lockedP;
    // transaction B starts now: it must block on the booking row until A commits, then see A's 800 and refuse
    let bDone = false;
    const bP = addPayment(user, bookingId, { kind: "PAYMENT", amount: 800, currency: "USD", method: "CASH", paidAt: D("2026-10-01") }).then((r) => { bDone = true; return r; });
    await new Promise((r) => setTimeout(r, 400));
    expect(bDone).toBe(false);
    release();
    expect((await a).ok).toBe(true);
    expect((await bP).ok).toBe(false);
    expect(await db.payment.count()).toBe(1);
  });
  it("a failed refund leaves the booking active (cancel is atomic)", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    await db.seatAssignment.create({ data: { bookingId, ticketNo: "T1" } });
    expect((await cancelBooking(user, bookingId, "x", { amount: 200, method: "CASH", paidAt: D("2026-10-05") })).ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ACTIVE");
    expect(await db.seatAssignment.count({ where: { bookingId } })).toBe(1);
    expect(await db.payment.count({ where: { kind: "REFUND" } })).toBe(0);
  });
  it("refuses a price below what was already paid, allows it after a refund", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 600, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    expect((await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 500 })).ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).priceAmount).toBe(1000);
    expect((await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 600 })).ok).toBe(true);
  });
  it("bookings are always priced in USD (the database refuses anything else)", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).priceCurrency).toBe("USD");
    await expect(db.booking.update({ where: { id: bookingId }, data: { priceCurrency: "IQD" } })).rejects.toThrow();
    // paying in dinars still works: converted to dollars at the typed rate
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 140000, currency: "IQD", rate: 1400, method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(true);
  });
  it("prices and payments keep their cents (stored as DECIMAL(14,2))", async () => {
    expect((await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000.5 })).ok).toBe(true);
    expect((await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000.555 })).ok).toBe(false); // more than 2 decimals
    for (const amount of [400.25, 300.1, 300.15]) expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount, currency: "USD", method: "CASH", paidAt: D("2026-10-01") })).ok).toBe(true);
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
    expect(b.priceAmount).toBe(1000.5);
    expect(b.payments.map((p) => p.amount).sort((x, y) => x - y)).toEqual([300.1, 300.15, 400.25]);
    expect(balance(b.priceAmount, b.payments.map((p) => ({ kind: p.kind, credited: p.credited })))).toBe(0);
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 0.01, currency: "USD", method: "CASH", paidAt: D("2026-10-02") })).ok).toBe(false); // already settled
    expect((await addPayment(user, bookingId, { kind: "REFUND", amount: 0.005, currency: "USD", reason: "x", method: "CASH", paidAt: D("2026-10-02") })).ok).toBe(false);
    const ref = await addPayment(user, bookingId, { kind: "REFUND", amount: 50.5, currency: "USD", reason: "x", method: "CASH", paidAt: D("2026-10-02") });
    expect(ref.ok).toBe(true);
    expect(balance(1000.5, (await db.payment.findMany({ where: { bookingId } })).map((p) => ({ kind: p.kind, credited: p.credited })))).toBe(50.5);
  });
  it("a move waits for a payment in progress, so no payment is left on the old booking", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => (locked = r));
    const pay = db.$transaction(async (tx) => {
      const r = await addPaymentTx(tx, user, bookingId, { kind: "PAYMENT", amount: 300, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
      locked(); await held; return r;
    });
    await lockedP;
    let moved = false;
    const mv = moveToTrip(user, bookingId, tripB).then((r) => { moved = true; return r; });
    await new Promise((r) => setTimeout(r, 400));
    expect(moved).toBe(false); // blocked on the booking row
    release();
    expect((await pay).ok).toBe(true);
    const r = await mv;
    expect(r.ok).toBe(true);
    const nb = await db.booking.findFirstOrThrow({ where: { tripId: tripB }, include: { payments: true } });
    expect(nb.payments.map((p) => p.amount)).toEqual([300]); // the payment travelled with the pilgrim
    expect(await db.payment.count({ where: { bookingId } })).toBe(0);
  });
  it("an archived trip stays open for payments and refunds, but price, cancel and moves are frozen", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    await addPayment(user, bookingId, { kind: "PAYMENT", amount: 500, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
    await db.trip.update({ where: { id: tripA }, data: { archivedAt: new Date() } });
    expect((await addPayment(user, bookingId, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-02") })).ok).toBe(true); // late payment
    expect((await addPayment(user, bookingId, { kind: "REFUND", amount: 50, currency: "USD", reason: "x", method: "CASH", paidAt: D("2026-10-03") })).ok).toBe(true);
    for (const r of [await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 900 }), await cancelBooking(user, bookingId, "x"), await moveToTrip(user, bookingId, tripB)]) {
      expect(r.ok).toBe(false); expect((r as { error: string }).error).toContain("مؤرشفة");
    }
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b).toMatchObject({ status: "ACTIVE", priceAmount: 1000, tripId: tripA });
  });
  it("nobody can be moved INTO an archived trip", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
    await db.trip.update({ where: { id: tripB }, data: { archivedAt: new Date() } });
    const r = await moveToTrip(user, bookingId, tripB);
    expect(r.ok).toBe(false); expect((r as { error: string }).error).toContain("مؤرشفة");
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("ACTIVE");
  });
  it("move keeps price, payments and history", async () => {
    await setBookingPrice(user, bookingId, { roomType: "QUAD", amount: 1000 });
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
