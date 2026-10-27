import { describe, it, expect } from "vitest";
import { normalizePhone, isIraqiMobile, isEmergencyPhone } from "./phone";
import { rangesOverlap, parseDate, formatDate, addMonths } from "./dates";
import { passportExpiryWarning, normalizePassportNo } from "./passport";
import { mahramWarning, ageOn } from "./mahram";
import { tripCounter } from "./capacity";
import { autoSeat, validateSeat, nonAdjacentGroups } from "./seating";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("phone", () => {
  it("accepts Mosul mobile formats", () => {
    expect(isIraqiMobile("07701234567")).toBe(true);
    expect(isIraqiMobile("+9647701234567")).toBe(true);
    expect(isIraqiMobile("٠٧٧٠١٢٣٤٥٦٧")).toBe(true);
    expect(normalizePhone("7701234567")).toBe("07701234567");
  });
  it("rejects bad numbers", () => {
    expect(isIraqiMobile("0770123")).toBe(false);
    expect(isIraqiMobile("08701234567")).toBe(false);
  });
  it("emergency accepts foreign numbers", () => {
    expect(isEmergencyPhone("+905551234567")).toBe(true);
    expect(isEmergencyPhone("abc")).toBe(false);
  });
});

describe("dates", () => {
  it("back-to-back trips do not overlap, real overlaps do", () => {
    expect(rangesOverlap(d("2026-11-01"), d("2026-11-10"), d("2026-11-11"), d("2026-11-20"))).toBe(false);
    expect(rangesOverlap(d("2026-11-01"), d("2026-11-10"), d("2026-11-10"), d("2026-11-20"))).toBe(true);
  });
  it("parses and formats", () => {
    expect(formatDate(parseDate("05/03/1980"))).toBe("05/03/1980");
    expect(parseDate("31/02/2000")).toBeNull();
    expect(formatDate(addMonths(d("2026-08-31"), 6))).toBe("28/02/2027");
  });
});

describe("passport expiry", () => {
  it("warns under 6 months after return", () => {
    expect(passportExpiryWarning(d("2027-01-01"), d("2026-11-10"), 6)).not.toBeNull();
    expect(passportExpiryWarning(d("2027-06-01"), d("2026-11-10"), 6)).toBeNull();
  });
  it("normalizes number", () => expect(normalizePassportNo(" a 123 ")).toBe("A123"));
});

describe("mahram", () => {
  const base = { gender: "FEMALE" as const, age: 40, hasMahram: false, inCompanionGroup: false, familyHasAdultMale: false };
  it("is off by default", () => expect(mahramWarning(base)).toBeNull());
  it("warns when enabled", () => expect(mahramWarning(base, { enabled: true, minAge: 12 })).not.toBeNull());
  it("exempts companion groups", () =>
    expect(mahramWarning({ ...base, inCompanionGroup: true }, { enabled: true, minAge: 12 })).toBeNull());
  it("age", () => expect(ageOn(d("1990-05-01"), d("2026-04-30"))).toBe(35));
});

describe("capacity", () => {
  it("counts", () => {
    const c = tripCounter({ capacity: 2, bookings: [{ ready: true, missing: [] }, { ready: false, missing: ["a", "b"] }, { ready: false, missing: [] }] });
    expect(c).toMatchObject({ registered: 3, ready: 1, missing: 2, over: true });
  });
});

describe("seating", () => {
  it("one pilgrim per seat", () => {
    const occ = new Map([[3, "x"]]);
    expect(validateSeat(3, 48, occ, "y")).not.toBeNull();
    expect(validateSeat(3, 48, occ, "x")).toBeNull();
    expect(validateSeat(49, 48, occ, "y")).not.toBeNull();
  });
  it("keeps families adjacent", () => {
    const seats = autoSeat(48, new Map(), [
      { bookingId: "s1" }, { bookingId: "f1", groupId: "F" }, { bookingId: "f2", groupId: "F" }, { bookingId: "f3", groupId: "F" },
    ]);
    expect(new Set(seats.values()).size).toBe(4);
    expect(nonAdjacentGroups(seats, [{ id: "F", bookingIds: ["f1", "f2", "f3"] }])).toEqual([]);
  });
  it("stops when bus is full", () => {
    const seats = autoSeat(2, new Map([[1, "z"]]), [{ bookingId: "a" }, { bookingId: "b" }]);
    expect(seats.size).toBe(1);
  });
});
