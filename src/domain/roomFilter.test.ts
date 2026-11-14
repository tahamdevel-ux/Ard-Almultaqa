import { describe, expect, it } from "vitest";
import { filterRooms, noRoomReason, personMatches, roomStatus, type RoomView } from "./roomFilter";

const room = (o: Partial<RoomView>): RoomView => ({ id: "r" + Math.random(), label: "1", category: "MEN", hotelId: "H1", capacity: 4, housed: 4, locked: false, warnings: 0, people: [{ name: "علي حسين محمد", passport: "A123", agent: "مكتب النور" }], ...o });
const none = { q: "", hotel: "", category: "" as const, status: "" as const };

describe("rooming filters", () => {
  const rooms = [
    room({ label: "a1", housed: 4 }),
    room({ label: "2", housed: 2, category: "WOMEN", hotelId: "H2", people: [{ name: "فاطمة أحمد", passport: "B777" }] }),
    room({ label: "3", housed: 0, people: [] }),
    room({ label: "4", housed: 3, warnings: 1, people: [{ name: "عمر يوسف", passport: "C9" }] }),
  ];
  it("status", () => {
    expect(roomStatus({ capacity: 4, housed: 4 })).toBe("full"); expect(roomStatus({ capacity: 4, housed: 2 })).toBe("incomplete"); expect(roomStatus({ capacity: 4, housed: 0 })).toBe("empty");
    expect(filterRooms(rooms, { ...none, status: "incomplete" }).map((r) => r.label)).toEqual(["2", "4"]);
    expect(filterRooms(rooms, { ...none, status: "warning" }).map((r) => r.label)).toEqual(["4"]);
    expect(filterRooms(rooms, { ...none, status: "empty" }).map((r) => r.label)).toEqual(["3"]);
  });
  it("hotel and category", () => {
    expect(filterRooms(rooms, { ...none, hotel: "H2" }).map((r) => r.label)).toEqual(["2"]);
    expect(filterRooms(rooms, { ...none, category: "WOMEN" }).map((r) => r.label)).toEqual(["2"]);
  });
  it("search finds a room by member name (Arabic variants), passport or label", () => {
    expect(filterRooms(rooms, { ...none, q: "فاطمه احمد" }).map((r) => r.label)).toEqual(["2"]); // ة/ه and أ/ا ignored
    expect(filterRooms(rooms, { ...none, q: "c9" }).map((r) => r.label)).toEqual(["4"]);
    expect(filterRooms(rooms, { ...none, q: "A1" }).map((r) => r.label)).toContain("a1");
    expect(filterRooms(rooms, { ...none, q: "النور" }).map((r) => r.label)).toContain("a1");
  });
  it("highlight and reasons", () => {
    expect(personMatches({ name: "علي حسين", passport: "A1" }, "حسين")).toBe(true);
    expect(personMatches({ name: "علي", passport: "A1" }, "")).toBe(false);
    expect(noRoomReason({ hasHotel: false, hasRoomType: false, noHousing: false })).toContain("فندق");
    expect(noRoomReason({ hasHotel: true, hasRoomType: false, noHousing: false })).toContain("نوع");
    expect(noRoomReason({ hasHotel: true, hasRoomType: true, noHousing: true })).toContain("بدون سكن");
  });
});
