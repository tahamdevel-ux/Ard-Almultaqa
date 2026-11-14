import { describe, expect, it } from "vitest";
import { checklistProgress, tripChecklist, type ChecklistInput } from "./checklist";

const base: ChecklistInput = { hasDates: true, pricedHotels: 1, madinahHotel: true, registered: 10, withoutHotelOrType: 0, withoutRoom: 0, transport: { land: true, unseated: 0, flights: 0 }, canSeePrices: true };

describe("trip checklist", () => {
  it("everything done", () => { const p = checklistProgress(tripChecklist(base, "/trips/x")); expect(p.done).toBe(p.total); expect(p.next).toBeNull(); });
  it("a new trip: dates, hotels, pilgrims first; later steps only appear once there are pilgrims", () => {
    const s = tripChecklist({ ...base, hasDates: false, pricedHotels: 0, madinahHotel: false, registered: 0 }, "/trips/x");
    expect(s.map((x) => x.key)).toEqual(["dates", "hotels", "pilgrims"]);
    expect(checklistProgress(s).next?.key).toBe("dates");
  });
  it("tells what is missing in words", () => {
    const s = tripChecklist({ ...base, withoutHotelOrType: 3, withoutRoom: 2, transport: { land: true, unseated: 4, flights: 0 } }, "/trips/x");
    expect(s.find((x) => x.key === "stay")!.detail).toContain("3 معتمر");
    expect(s.find((x) => x.key === "rooms")!.detail).toContain("2 معتمر");
    expect(s.find((x) => x.key === "transport")!.detail).toContain("4 معتمر");
    expect(checklistProgress(s).next?.key).toBe("stay");
  });
  it("air trips ask for a flight instead of seats; no hotel means the stay step waits", () => {
    const air = tripChecklist({ ...base, transport: { land: false, unseated: 0, flights: 0 }, pricedHotels: 0 }, "/trips/x");
    expect(air.find((x) => x.key === "transport")!.title).toBe("الرحلة الجوية");
    expect(air.find((x) => x.key === "stay")!.done).toBe(false);
  });
});
