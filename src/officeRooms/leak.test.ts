import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import os from "os";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { addPilgrimToTrips } from "@/server/bookings";
import { addPayment } from "@/server/payments";
import { renderAgentStatement, renderFlightList, renderManifest, renderReceipt, renderRooming } from "@/outputs/render";
import { manifestData, flightListData, roomingData, agentStatementData } from "@/outputs/viewmodels";
import { renderOfficeRoomsPdf } from "./print";
import { roomLabel } from "@/domain/officeRooms";

const D = (s: string) => new Date(s + "T00:00:00Z");
const user = { id: "acc1", username: "acc", name: "المحاسب", role: "ACCOUNTANT" as const };
const CODE = "zq"; // improbable text: the labels become zq1, zq2 …
let tripId = "", busId = "", paymentId = "", agentId = "", labels: string[] = [];

async function wipe() {
  await db.officeRoomMember.deleteMany(); await db.officeRoom.deleteMany(); await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.roomAssignment.deleteMany(); await db.room.deleteMany();
  await db.seatAssignment.deleteMany(); await db.bookingGroupMember.deleteMany(); await db.familyGroup.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany(); await db.agent.deleteMany(); await db.hotel.deleteMany();
}

beforeAll(async () => {
  await wipe();
  const agent = await db.agent.create({ data: { name: "وكيل الاختبار", roomCode: CODE } });
  agentId = agent.id;
  const hotel = await db.hotel.create({ data: { officialName: "Test Hotel", city: "MAKKAH" } });
  const trip = await db.trip.create({ data: { name: "رحلة التسريب", transportType: "LAND", capacity: 20, departDate: D("2026-12-01"), returnDate: D("2026-12-10"), makkahHotelId: hotel.id } });
  tripId = trip.id;
  const bus = await db.bus.create({ data: { tripId, number: "1", seatCount: 48 } });
  busId = bus.id;
  const room = await db.room.create({ data: { tripId, hotelId: hotel.id, city: "MAKKAH", roomNo: "501", type: "QUAD", beds: 4 } });
  for (let i = 0; i < 6; i++) {
    const p = await db.pilgrim.create({ data: { firstName: `معتمر${i}`, fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: D("1980-01-01"), passportNo: `A${60000000 + i}`, enGivenName: "A", enSurname: "B", passportExpiry: D("2035-01-01"), agentId } });
    await addPilgrimToTrips(db, p.id, agentId, [tripId]);
    const b = await db.booking.findFirstOrThrow({ where: { pilgrimId: p.id, tripId } });
    await db.booking.update({ where: { id: b.id }, data: { priceAmount: 1000 } });
    await db.roomAssignment.create({ data: { roomId: room.id, bookingId: b.id, city: "MAKKAH" } });
    if (i === 0) {
      const r = await addPayment(user, b.id, { kind: "PAYMENT", amount: 100, currency: "USD", method: "CASH", paidAt: D("2026-10-01") });
      if (r.ok) paymentId = r.id!;
    }
  }
  labels = (await db.officeRoom.findMany({ where: { tripId } })).map(roomLabel);
}, 120_000);
afterAll(wipe);

async function xlsxText(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? "")))));
  return out.join("\n");
}
function pdfText(buf: Buffer): string | null {
  const f = path.join(os.tmpdir(), `leak-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }); } catch { return null; } finally { fs.unlinkSync(f); }
}

describe("office rooms never appear in any other output", () => {
  it("the trip has office rooms with the agent code in their labels", () => {
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l.startsWith(CODE) || /^\d+$/.test(l))).toBe(true);
  });

  it("view-models behind every other output contain no office room data", async () => {
    const all = JSON.stringify([await manifestData(tripId, busId), await flightListData(tripId), await roomingData(tripId, "MAKKAH"), await agentStatementData(agentId)]);
    expect(all).not.toContain(CODE);
    expect(all.toLowerCase()).not.toContain("officeroom");
    expect(all).not.toContain("غرف المكتب");
  }, 60_000);

  it("every Excel output is free of office room labels", async () => {
    const files = [await renderManifest(tripId, busId, "xlsx"), await renderFlightList(tripId, "xlsx"), await renderRooming(tripId, "MAKKAH", "ar", "xlsx"), await renderRooming(tripId, "MAKKAH", "en", "xlsx"), await renderAgentStatement(agentId, undefined, "xlsx")];
    for (const f of files) {
      const t = await xlsxText(f);
      expect(t.length).toBeGreaterThan(20);
      for (const l of labels.filter((x) => x.startsWith(CODE))) expect(t).not.toContain(l);
      expect(t).not.toContain("غرفة المكتب");
    }
  }, 60_000);

  it("every PDF output is free of office room labels (and the internal print has them)", async () => {
    const others = [await renderManifest(tripId, busId, "pdf"), await renderFlightList(tripId, "pdf"), await renderRooming(tripId, "MAKKAH", "ar", "pdf"), await renderRooming(tripId, "MAKKAH", "en", "pdf"), await renderAgentStatement(agentId, undefined, "pdf"), await renderReceipt(paymentId)];
    const texts = others.map(pdfText);
    if (texts.every((t) => t === null)) return; // pdftotext missing: the data-level checks above still run
    for (const t of texts) { expect(t).not.toBeNull(); expect(t!.length).toBeGreaterThan(20); expect(t).not.toContain(CODE + "1"); expect(t).not.toContain("غرف المكتب"); }
    const internal = pdfText(await renderOfficeRoomsPdf(tripId))!;
    expect(internal).toContain(CODE + "1");
  }, 180_000);

  it("only the internal print module and the office room feature import office room code", () => {
    const root = path.join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const rel = path.relative(root, p);
          if (rel.startsWith("outputs" + path.sep) || rel.startsWith(path.join("app", "api", "payments")) || rel.startsWith(path.join("app", "api", "agents")) || rel === path.join("app", "api", "trips", "[id]", "outputs", "[kind]", "route.ts")) {
            const src = fs.readFileSync(p, "utf8");
            if (/officeRooms|OfficeRoom|officeMember/.test(src)) offenders.push(rel);
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
