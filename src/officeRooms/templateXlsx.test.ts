import { describe, it, expect, beforeEach, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { addPilgrimToTrips } from "@/server/bookings";
import { linkBookings } from "@/server/links";
import { renderOfficeRoomsTemplateXlsx } from "./templateXlsx";

const D = (s: string) => new Date(s + "T00:00:00Z");
async function wipe() {
  await db.bookingLinkMember.deleteMany(); await db.bookingLink.deleteMany();
  await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany();
  await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany();
  await db.tripHotelPrice.deleteMany(); await db.tripHotel.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.hotel.deleteMany();
}
beforeEach(wipe); afterAll(wipe);
let n = 0;

describe("internal rooming in the office template", () => {
  it("fills rooms, hotel, links and statistics; more than 16 rooms continue on a new sheet; a 7-bed room shares its last row", async () => {
    const t = await db.trip.create({ data: { name: "قافلة الاختبار", tripNo: "Z-1", transportType: "LAND", capacity: 99 } });
    const h = await db.hotel.create({ data: { officialName: "Ramada", localName: "رمادا", city: "MAKKAH" } });
    const th = await db.tripHotel.create({ data: { tripId: t.id, hotelId: h.id } });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const p = await db.pilgrim.create({ data: { firstName: `اسم${++n}`, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `A${80000000 + n}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01") } });
      await addPilgrimToTrips(db, p.id, null, [t.id]);
      ids.push((await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId: t.id } })).id);
    }
    await db.booking.updateMany({ where: { tripId: t.id }, data: { tripHotelId: th.id } });
    await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany();
    const seven = await db.officeRoom.create({ data: { tripId: t.id, seq: 1, capacity: 7, roomType: "SEPT", category: "MEN", tripHotelId: th.id, note: "غرفة الاختبار" } });
    for (const b of ids.slice(0, 7)) await db.officeRoomMember.create({ data: { officeRoomId: seven.id, bookingId: b } });
    await db.$transaction((tx) => linkBookings(tx, { id: "u", name: "u" }, t.id, [ids[0], ids[7]], "أخوة"));
    for (let i = 0; i < 16; i++) await db.officeRoom.create({ data: { tripId: t.id, seq: 10 + i, capacity: 2, roomType: "DOUBLE", category: "MEN", tripHotelId: th.id } });

    const buf = await renderOfficeRoomsTemplateXlsx(t.id);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never);
    expect(wb.worksheets).toHaveLength(2); // 17 rooms
    const s1 = wb.worksheets[0];
    expect(String(s1.getCell("A1").value)).toContain("قافلة الاختبار");
    // the 7-bed room is printed first (lowest number): label, type, hotel + name, names (7th shares row 6)
    expect(String(s1.getCell("A4").value)).toBe("1");
    expect(String(s1.getCell("B4").value)).toBe("سباعي");
    expect(String(s1.getCell("A3").value)).toBe("رمادا"); // the hotel: a cell of its own above the room
    expect(String(s1.getCell("A11").value)).toBe("غرفة الاختبار"); // the room's own name: the box below
    expect(String(s1.getCell("A10").value)).toContain(" + ");
    // statistics: 16 rooms on the first sheet, 7 people (the 8th has no room), 1 seven-bed room
    expect(Number((s1.getCell("A25").value as { result?: number }).result ?? s1.getCell("A25").value)).toBe(16);
    expect(Number((s1.getCell("A26").value as { result?: number }).result ?? s1.getCell("A26").value)).toBe(7);
    expect(Number((s1.getCell("A32").value as { result?: number }).result ?? s1.getCell("A32").value)).toBe(1);
    // the linked pilgrim in a room has a tinted name cell and the notes area explains the colour
    const fill = s1.getCell("A5").fill as { fgColor?: { argb?: string } };
    expect(fill?.fgColor?.argb).toBeTruthy();
    expect(String(s1.getCell("A37").value)).toContain("أخوة");
    expect(wb.worksheets[1].getCell("A4").value).toBeTruthy();
  });
});
