import { describe, it, expect } from "vitest";
import { normalizePassport, validatePassport, normalizePhone, validatePhone, checkPhone, checkPhoneList, PASSPORT_ERRORS, PHONE_ERROR } from "./identity";
import { rangesOverlap, parseDate, formatDate, addMonths, tripsOverlap } from "./dates";
import { parseTripIdentity } from "./tripFields";
import { passportExpiryWarning, normalizePassportNo } from "./passport";
import { mahramWarning, ageOn } from "./mahram";
import { tripCounter } from "./capacity";
import { autoSeat, validateSeat, nonAdjacentGroups } from "./seating";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("phone (Iraq 07 / Saudi 05)", () => {
  const ok = (raw: string) => validatePhone(normalizePhone(raw)) === null;
  it("accepts Iraqi and Saudi numbers in all supported spellings", () => {
    expect(ok("07701234567")).toBe(true);
    expect(ok("+964 770 123 4567")).toBe(true);
    expect(ok("00964-770-123-4567")).toBe(true);
    expect(ok("٠٧٧٠١٢٣٤٥٦٧")).toBe(true);
    expect(ok("(0770) 123.4567")).toBe(true);
    expect(ok("0501234567")).toBe(true);
    expect(ok("+966501234567")).toBe(true);
    expect(ok("00966 50 123 4567")).toBe(true);
  });
  it("normalizes to the local value", () => {
    expect(normalizePhone("+9647701234567")).toBe("07701234567");
    expect(normalizePhone("+966501234567")).toBe("0501234567");
    expect(normalizePhone("۰۷۷۰۱۲۳۴۵۶۷")).toBe("07701234567");
  });
  it("rejects everything else with the Arabic message", () => {
    for (const bad of ["0770123", "08701234567", "050123456", "05012345678", "0770123456", "077012345678", "+905551234567", "abc", "7701234567"]) {
      expect(validatePhone(normalizePhone(bad)), bad).toBe(PHONE_ERROR);
    }
  });
  it("empty is allowed, lists are validated one by one", () => {
    expect(checkPhone("  ")).toEqual({ value: null });
    expect(checkPhone("0770 123 4567")).toEqual({ value: "07701234567" });
    expect(checkPhoneList("07701234567، 0501234567").values).toEqual(["07701234567", "0501234567"]);
    expect(checkPhoneList("07701234567 123").error).toBe(PHONE_ERROR);
  });
});

describe("passport number", () => {
  it("normalizes: spaces removed, digits converted, uppercase", () => {
    expect(normalizePassport(" a 123 456 78 ")).toBe("A12345678");
    expect(normalizePassport("a١٢٣٤٥٦٧٨")).toBe("A12345678");
    expect(normalizePassport("a۱۲۳۴۵۶۷۸")).toBe("A12345678");
    expect(normalizePassport("a12345678")).toBe(normalizePassportNo("A12345678"));
  });
  it("Iraqi: one letter + 8 digits", () => {
    expect(validatePassport("A12345678", "IRAQI")).toBeNull();
    for (const bad of ["12345678A", "AB1234567", "A1234567", "A123456789", "A1234567X", "N1234567"]) expect(validatePassport(bad, "IRAQI"), bad).toBe(PASSPORT_ERRORS.IRAQI);
    expect(validatePassport("A12345678")).toBeNull(); // IRAQI is the default
  });
  it("Foreign: 6 to 12 letters or digits", () => {
    for (const good of ["N1234567", "AB1234", "ABCDEFGHIJKL", "123456"]) expect(validatePassport(good, "FOREIGN"), good).toBeNull();
    for (const bad of ["AB123", "ABCDEFGHIJKLM", "AB-12345", "AB 12345"]) expect(validatePassport(bad, "FOREIGN"), bad).toBe(PASSPORT_ERRORS.FOREIGN);
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
    const c = tripCounter({ capacity: 2, bookings: [{ ready: true }, { ready: false }, { ready: false }] });
    expect(c).toMatchObject({ registered: 3, ready: 1, over: true });
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

import { canPlace, autoAssignRooms, stayDates, occupancy, ROOM_BEDS } from "./rooming";
import { readiness } from "./readiness";

const occ = (id: string, gender: "MALE" | "FEMALE", groupIds: string[] = []) => ({ bookingId: id, gender, groupIds });
const room = (id: string, beds: number, occupants: ReturnType<typeof occ>[] = []) => ({ id, roomNo: id, beds, occupants });

describe("rooming rules", () => {
  it("never exceeds bed capacity", () => {
    expect(canPlace(room("1", 2, [occ("a", "MALE"), occ("b", "MALE")]), occ("c", "MALE"))).toBe("الغرفة ممتلئة");
  });
  it("separates men and women unless same group", () => {
    expect(canPlace(room("1", 4, [occ("a", "MALE")]), occ("w", "FEMALE"))).not.toBeNull();
    expect(canPlace(room("1", 4, [occ("a", "MALE", ["f"])]), occ("w", "FEMALE", ["f"]))).toBeNull();
  });
  it("occupancy colour state", () => {
    expect(occupancy(room("1", 2))).toBe("empty");
    expect(occupancy(room("1", 2, [occ("a", "MALE")]))).toBe("partial");
    expect(occupancy(room("1", 1, [occ("a", "MALE")]))).toBe("full");
    expect(ROOM_BEDS.QUAD).toBe(4);
  });
  it("auto-assign keeps a عصبة of 4 women in one quad room", () => {
    const people = [occ("w1", "FEMALE", ["g"]), occ("w2", "FEMALE", ["g"]), occ("w3", "FEMALE", ["g"]), occ("w4", "FEMALE", ["g"]), occ("m1", "MALE")];
    const r = autoAssignRooms([room("101", 2), room("102", 4), room("103", 3)], people);
    expect(new Set(["w1", "w2", "w3", "w4"].map((b) => r.assignments.get(b))).size).toBe(1);
    expect(r.assignments.get("w1")).toBe("102");
    expect(r.assignments.get("m1")).not.toBe("102");
    expect(r.unplaced).toEqual([]);
  });
  it("auto-assign never mixes genders and reports leftovers", () => {
    const people = [occ("m1", "MALE"), occ("w1", "FEMALE"), occ("m2", "MALE")];
    const r = autoAssignRooms([room("1", 2)], people);
    // one room: whoever lands first gets it; the other gender is unplaced
    expect(r.assignments.size + r.unplaced.length).toBe(3);
    const placed = [...r.assignments.keys()];
    expect(new Set(placed.map((b) => people.find((p) => p.bookingId === b)!.gender)).size).toBe(1);
    expect(placed.length).toBeLessThanOrEqual(2);
  });
  it("family of mixed gender shares a room", () => {
    const r = autoAssignRooms([room("1", 4)], [occ("h", "MALE", ["f"]), occ("w", "FEMALE", ["f"])]);
    expect(r.assignments.get("h")).toBe("1"); expect(r.assignments.get("w")).toBe("1");
  });
  it("splits a group larger than any room across rooms and flags it", () => {
    const g = ["a", "b", "c", "d", "e"].map((i) => occ(i, "FEMALE", ["g"]));
    const r = autoAssignRooms([room("1", 3), room("2", 3)], g);
    expect(r.splitGroups).toEqual(["g"]); expect(r.assignments.size).toBe(5);
  });
  it("stay dates: Madinah first then Makkah", () => {
    const s = stayDates(d("2026-11-15"), "MADINAH", 6, 4);
    expect(s[0]).toMatchObject({ city: "MADINAH" });
    expect(formatDate(s[0].checkOut)).toBe("19/11/2026");
    expect(s[1].city).toBe("MAKKAH"); expect(formatDate(s[1].checkOut)).toBe("25/11/2026");
  });
});

describe("readiness", () => {
  it("ready only when the booking is active and the passport number is entered", () => {
    expect(readiness({ bookingActive: true, passportNo: "A12345678" }).ready).toBe(true);
    expect(readiness({ bookingActive: true, passportNo: "  " }).ready).toBe(false);
    expect(readiness({ bookingActive: true, passportNo: null }).ready).toBe(false);
    expect(readiness({ bookingActive: false, passportNo: "A12345678" }).ready).toBe(false);
  });
});

import { formatMoney, paidTotal, balance, checkPayment, creditedValue, agentStatement } from "./money";

describe("money", () => {
  it("formats", () => {
    expect(formatMoney(1500000, "IQD")).toBe("1,500,000 د.ع");
    expect(formatMoney(1200.5, "USD")).toBe("$1,200.5");
  });
  it("converts dinar payments to dollars at the payment-time rate", () => {
    expect(creditedValue(1_400_000, "IQD", "USD", 1400)).toBe(1000);
    expect(creditedValue(100, "USD", "USD")).toBe(100);
    expect(creditedValue(100, "IQD", "USD", null)).toBeNull();
    expect(creditedValue(100, "USD", "IQD", 1500)).toBe(150000);
  });
  it("balance = price - (payments - refunds), mixed currencies", () => {
    const ps = [{ kind: "PAYMENT" as const, credited: 1000 }, { kind: "PAYMENT" as const, credited: 357.14 }, { kind: "REFUND" as const, credited: 200 }];
    expect(paidTotal(ps)).toBe(1157.14);
    expect(balance(1500, ps)).toBe(342.86);
    expect(balance(null, ps)).toBeNull();
  });
  it("validates payments and refunds", () => {
    const ps = [{ kind: "PAYMENT" as const, credited: 1000 }];
    expect(checkPayment({ kind: "PAYMENT", amount: 0, currency: "USD" }, "USD", ps)).toHaveProperty("error");
    expect(checkPayment({ kind: "PAYMENT", amount: 700000, currency: "IQD" }, "USD", ps)).toHaveProperty("error"); // no rate
    expect(checkPayment({ kind: "PAYMENT", amount: 700000, currency: "IQD", rate: 1400 }, "USD", ps)).toEqual({ credited: 500 });
    expect(checkPayment({ kind: "REFUND", amount: 500, currency: "USD" }, "USD", ps)).toHaveProperty("error"); // no reason
    expect(checkPayment({ kind: "REFUND", amount: 2000, currency: "USD", reason: "x" }, "USD", ps)).toHaveProperty("error");
    expect(checkPayment({ kind: "REFUND", amount: 500, currency: "USD", reason: "x" }, "USD", ps)).toEqual({ credited: 500 });
  });
  it("agent statement: percent", () => {
    const s = agentStatement([{ price: 1000, paid: 400, cancelled: false }, { price: 1000, paid: 1000, cancelled: false }], { type: "PERCENT", value: 5 });
    expect(s).toMatchObject({ totalPrice: 2000, commission: 100, netToCompany: 1900, collected: 1400, dueToCompany: 500, count: 2 });
  });
  it("agent statement: fixed wholesale, cancelled gives no commission", () => {
    const s = agentStatement([{ price: 1000, paid: 0, cancelled: false }, { price: 1000, paid: 100, cancelled: true }], { type: "FIXED_WHOLESALE", value: 900 });
    expect(s).toMatchObject({ totalPrice: 1000, commission: 100, netToCompany: 900, collected: 100, dueToCompany: 800, count: 1 });
  });
});


describe("optional trip code and dates", () => {
  it("passport check is skipped silently when the trip has no return date", () => {
    expect(passportExpiryWarning(d("2026-12-01"), null, 6)).toBeNull();
    expect(passportExpiryWarning(d("2026-12-01"), undefined, 6)).toBeNull();
  });
  it("overlap check skips any trip missing either date", () => {
    const full = { departDate: d("2026-11-01"), returnDate: d("2026-11-10") };
    expect(tripsOverlap(full, { departDate: d("2026-11-05"), returnDate: d("2026-11-20") })).toBe(true);
    expect(tripsOverlap(full, { departDate: null, returnDate: null })).toBe(false);
    expect(tripsOverlap(full, { departDate: d("2026-11-05"), returnDate: null })).toBe(false);
    expect(tripsOverlap({ departDate: null, returnDate: d("2026-11-10") }, full)).toBe(false);
    expect(tripsOverlap({ departDate: null, returnDate: null }, { departDate: null, returnDate: null })).toBe(false);
  });
  it("stay dates are null (not 1970 or NaN) without a departure date", () => {
    const s = stayDates(null, "MADINAH", 6, 4);
    expect(s.map((x) => x.city)).toEqual(["MADINAH", "MAKKAH"]);
    expect(s.every((x) => x.checkIn === null && x.checkOut === null)).toBe(true);
    expect(formatDate(s[0].checkIn)).toBe("");
  });
  it("parseTripIdentity: everything empty is valid and stored as null", () => {
    expect(parseTripIdentity({})).toEqual({ ok: true, tripNo: null, departDate: null, returnDate: null });
    expect(parseTripIdentity({ tripNo: "  ", departDate: "", returnDate: "   " })).toEqual({ ok: true, tripNo: null, departDate: null, returnDate: null });
  });
  it("parseTripIdentity: partial values are accepted", () => {
    expect(parseTripIdentity({ tripNo: " L-1 " })).toMatchObject({ ok: true, tripNo: "L-1", departDate: null, returnDate: null });
    expect(parseTripIdentity({ departDate: "15/11/2026" })).toMatchObject({ ok: true, returnDate: null });
    expect(parseTripIdentity({ returnDate: "27/11/2026" })).toMatchObject({ ok: true, departDate: null });
  });
  it("parseTripIdentity keeps the rule: return cannot be before departure when both are filled", () => {
    expect(parseTripIdentity({ departDate: "15/11/2026", returnDate: "14/11/2026" })).toMatchObject({ ok: false });
    expect(parseTripIdentity({ departDate: "15/11/2026", returnDate: "15/11/2026" })).toMatchObject({ ok: true });
  });
  it("parseTripIdentity rejects a filled but invalid date", () => {
    expect(parseTripIdentity({ departDate: "31/02/2026" })).toMatchObject({ ok: false });
    expect(parseTripIdentity({ returnDate: "soon" })).toMatchObject({ ok: false });
  });
});

import { maskDateTyping, completeDate, asciiDigits } from "./dateMask";

describe("date typing mask (slash is automatic)", () => {
  it("keeps growing after the slash was added", () => {
    expect(maskDateTyping("15/112")).toBe("15/11/2");
    expect(maskDateTyping("15/11/2026")).toBe("15/11/2026");
  });
  it("inserts slashes while typing digits", () => {
    expect(maskDateTyping("1")).toBe("1");
    expect(maskDateTyping("15")).toBe("15");
    expect(maskDateTyping("151")).toBe("15/1");
    expect(maskDateTyping("1511")).toBe("15/11");
    expect(maskDateTyping("15112")).toBe("15/11/2");
    expect(maskDateTyping("15112026")).toBe("15/11/2026");
  });
  it("keeps at most 8 digits and drops letters", () => {
    expect(maskDateTyping("151120261234")).toBe("15/11/2026");
    expect(maskDateTyping("1a5b1c1")).toBe("15/11");
    expect(maskDateTyping("")).toBe("");
  });
  it("accepts Arabic-Indic digits", () => {
    expect(asciiDigits("١٥/١١/٢٠٢٦")).toBe("15/11/2026");
    expect(maskDateTyping("١٥١١٢٠٢٦")).toBe("15/11/2026");
  });
  it("accepts typed separators, pasted dates and fixes them", () => {
    expect(maskDateTyping("15/11/2026")).toBe("15/11/2026");
    expect(maskDateTyping("15-11-2026")).toBe("15/11/2026");
    expect(maskDateTyping("15.11.2026")).toBe("15/11/2026");
    expect(maskDateTyping("15 / 11 / 2026")).toBe("15/11/2026");
    expect(maskDateTyping("1/")).toBe("01/");
    expect(maskDateTyping("15/")).toBe("15/");
    expect(maskDateTyping("15/1")).toBe("15/1");
    expect(maskDateTyping("15//11")).toBe("15/11");
  });
  it("backspacing over a slash does not get stuck", () => {
    expect(maskDateTyping("15/1")).toBe("15/1");
    expect(maskDateTyping("15/")).toBe("15/");
    expect(maskDateTyping("15")).toBe("15");
  });
  it("completeDate pads single digits on blur and leaves incomplete input alone", () => {
    expect(completeDate("5/3/2026")).toBe("05/03/2026");
    expect(completeDate("15/11/2026")).toBe("15/11/2026");
    expect(completeDate("15/11")).toBe("15/11");
    expect(completeDate("15/")).toBe("15");
    expect(completeDate("")).toBe("");
  });
  it("a masked value is accepted by the date parser", () => {
    expect(parseDate(maskDateTyping("15112026"))).not.toBeNull();
    expect(parseDate(completeDate("5/3/2026"))).not.toBeNull();
  });
});
