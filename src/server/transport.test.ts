import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "./db";
import { addPilgrimToTrips } from "./bookings";
import { setTransport } from "./transport";
import { defaultMode, effectiveMode, transportText } from "@/domain/transport";

const user = { id: "u1", username: "a", name: "مدير", role: "ADMIN" as const };
const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany();
  await db.booking.deleteMany(); await db.bus.deleteMany(); await db.groundCar.deleteMany(); await db.flight.deleteMany(); await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
}
beforeEach(wipe); afterAll(wipe);
let n = 0;
async function book(tripId: string) {
  const p = await db.pilgrim.create({ data: { motherName: "ام", firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `TR${++n}${Date.now()}`.slice(0, 9), enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
  await addPilgrimToTrips(db, p.id, null, [tripId]);
  return db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId }, include: { seat: true } });
}

describe("transport per pilgrim", () => {
  it("defaults: bus on land trips, flight on air trips", () => {
    expect(defaultMode("LAND")).toBe("BUS"); expect(defaultMode("AIR")).toBe("FLIGHT");
    expect(effectiveMode(null, "LAND")).toBe("BUS"); expect(effectiveMode("CAR", "LAND")).toBe("CAR");
    expect(transportText("BUS", { bus: { number: "2", name: null }, seatNo: 14 })).toBe("باص 2 / مقعد 14");
  });

  it("land trip: seated on a bus by default; car frees the seat; back to bus seats him again", async () => {
    const t = await db.trip.create({ data: { name: "بر", transportType: "LAND", capacity: 20 } });
    const car = await db.groundCar.create({ data: { tripId: t.id, label: "كيا" } });
    const b = await book(t.id);
    expect(b.seat?.busId).toBeTruthy(); expect(b.transport).toBeNull();
    expect((await setTransport(user, t.id, b.id, { mode: "CAR", carId: car.id })).ok).toBe(true);
    let after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { seat: true } });
    expect(after.transport).toBe("CAR"); expect(after.seat).toMatchObject({ busId: null, seatNo: null, carId: car.id });
    expect((await setTransport(user, t.id, b.id, { mode: "BUS" })).ok).toBe(true);
    after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { seat: true } });
    expect(after.transport).toBeNull(); // bus is the default of a land trip
    expect(after.seat?.busId).toBeTruthy(); expect(after.seat?.carId).toBeNull();
  });

  it("a car needs one of the trip's own cars; a flight must belong to the trip", async () => {
    const t = await db.trip.create({ data: { name: "بر", transportType: "LAND", capacity: 20 } });
    const other = await db.trip.create({ data: { name: "أخرى", transportType: "AIR", capacity: 20 } });
    const foreign = await db.groundCar.create({ data: { tripId: other.id, label: "x" } });
    const foreignFlight = await db.flight.create({ data: { tripId: other.id, flightNo: "EP1" } });
    const b = await book(t.id);
    expect((await setTransport(user, t.id, b.id, { mode: "CAR" })).ok).toBe(false);
    expect((await setTransport(user, t.id, b.id, { mode: "CAR", carId: foreign.id })).ok).toBe(false);
    expect((await setTransport(user, t.id, b.id, { mode: "FLIGHT", flightId: foreignFlight.id })).ok).toBe(false);
    expect((await setTransport(user, t.id, b.id, { mode: "boat" })).ok).toBe(false);
  });

  it("air trip: default is the flight; he can be put on a named flight, or on a bus", async () => {
    const t = await db.trip.create({ data: { name: "جو", transportType: "AIR", capacity: 20 } });
    const fl = await db.flight.create({ data: { tripId: t.id, flightNo: "EP123" } });
    const b = await book(t.id);
    expect(b.seat).toBeNull(); expect(effectiveMode(b.transport, "AIR")).toBe("FLIGHT");
    expect((await setTransport(user, t.id, b.id, { mode: "FLIGHT", flightId: fl.id })).ok).toBe(true);
    expect((await db.seatAssignment.findUniqueOrThrow({ where: { bookingId: b.id } })).flightId).toBe(fl.id);
    expect((await setTransport(user, t.id, b.id, { mode: "BUS" })).ok).toBe(true);
    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { seat: true } });
    expect(after.transport).toBe("BUS"); expect(after.seat?.busId).toBeTruthy(); expect(after.seat?.flightId).toBeNull();
  });
});
