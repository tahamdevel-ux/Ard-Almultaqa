import { describe, expect, it } from "vitest";
import { computePrice, noHousingError, resolveCommission } from "./pricing";

const table = { prices: { DOUBLE: 500, TRIPLE: 450 }, noHousingPrice: 300 };
describe("computePrice", () => {
  it("room price of the hotel", () => expect(computePrice({ table, roomType: "DOUBLE", noHousing: false, sarfByPilgrim: false, sarfAmount: 50 })).toEqual({ ok: true, amount: 500, sarf: 0, foodDiscount: 0 }));
  it("adds sarf only when the pilgrim pays it", () => expect(computePrice({ table, roomType: "TRIPLE", noHousing: false, sarfByPilgrim: true, sarfAmount: 50 })).toEqual({ ok: true, amount: 500, sarf: 50, foodDiscount: 0 }));
  it("no-housing price ignores room type", () => expect(computePrice({ table, roomType: null, noHousing: true, sarfByPilgrim: false, sarfAmount: null })).toEqual({ ok: true, amount: 300, sarf: 0, foodDiscount: 0 }));
  it("errors", () => {
    expect(computePrice({ table: null, roomType: "DOUBLE", noHousing: false, sarfByPilgrim: false, sarfAmount: null }).ok).toBe(false);
    expect(computePrice({ table, roomType: "QUAD", noHousing: false, sarfByPilgrim: false, sarfAmount: null }).ok).toBe(false);
    expect(computePrice({ table: { prices: {}, noHousingPrice: null }, roomType: null, noHousing: true, sarfByPilgrim: false, sarfAmount: null }).ok).toBe(false);
    expect(computePrice({ table, roomType: null, noHousing: false, sarfByPilgrim: false, sarfAmount: null }).ok).toBe(false);
  });
});
describe("no-food discount", () => {
  it("is taken off only when the pilgrim has no food, and only when the trip sets it", () => {
    const base = { table, roomType: "DOUBLE" as const, noHousing: false, sarfByPilgrim: false, sarfAmount: null };
    expect(computePrice({ ...base, withFood: false, noFoodDiscount: 25 })).toEqual({ ok: true, amount: 475, sarf: 0, foodDiscount: 25 });
    expect(computePrice({ ...base, withFood: true, noFoodDiscount: 25 })).toEqual({ ok: true, amount: 500, sarf: 0, foodDiscount: 0 });
    expect(computePrice({ ...base, withFood: false, noFoodDiscount: null })).toEqual({ ok: true, amount: 500, sarf: 0, foodDiscount: 0 });
    expect(computePrice({ ...base })).toEqual({ ok: true, amount: 500, sarf: 0, foodDiscount: 0 }); // food unknown = with food
  });
  it("works with sarf and no-housing, with cents, and never goes below zero", () => {
    expect(computePrice({ table, roomType: "TRIPLE", noHousing: false, sarfByPilgrim: true, sarfAmount: 50, withFood: false, noFoodDiscount: 12.5 })).toMatchObject({ amount: 487.5, sarf: 50, foodDiscount: 12.5 });
    expect(computePrice({ table, roomType: null, noHousing: true, sarfByPilgrim: false, sarfAmount: null, withFood: false, noFoodDiscount: 40 })).toMatchObject({ amount: 260 });
    expect(computePrice({ table, roomType: "DOUBLE", noHousing: false, sarfByPilgrim: false, sarfAmount: null, withFood: false, noFoodDiscount: 9999 })).toMatchObject({ amount: 0 });
  });
});
describe("commission / no housing", () => {
  it("resolves", () => { expect(resolveCommission(20, 10)).toBe(20); expect(resolveCommission(null, 10)).toBe(10); expect(resolveCommission(undefined, null)).toBe(0); expect(resolveCommission(0, 10)).toBe(0); });
  it("no-housing head rules", () => {
    expect(noHousingError({ hasHead: false, headBookingHotelId: null, hotelId: "a" })).not.toBeNull();
    expect(noHousingError({ hasHead: true, headBookingHotelId: "b", hotelId: "a" })).not.toBeNull();
    expect(noHousingError({ hasHead: true, headBookingHotelId: "a", hotelId: "a" })).toBeNull();
  });
});
