import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { readWorkbook, errorReport } from "./engine";
import { autoMap } from "./fields";
import { buildPreview, commitImport } from "./commit";
import { createPilgrim, pilgrimSchema, updatePilgrim, DUPLICATE_PASSPORT_MSG } from "@/server/pilgrims";

const HEAD = ["الاسم الأول", "اسم الأب", "اسم الجد", "اللقب", "الجنس", "تاريخ الميلاد", "رقم الجواز", "Given name", "Surname", "تاريخ الانتهاء", "الهاتف"];
const user = { id: "u1", username: "t", name: "مختبر", role: "ADMIN" as const };

async function sample(n: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("معتمرين");
  ws.addRow(HEAD);
  for (let i = 0; i < n; i++) {
    const bad = i % 50 === 7; // 4 bad rows
    ws.addRow(["محمد", "علي", "حسن", "الجبوري", i % 2 ? "أنثى" : "ذكر", new Date(Date.UTC(1980, 0, 1 + (i % 28))), `T${String(1000000 + i)}`,
      "MOHAMMED", "ALJUBOURI", i % 3 === 0 ? "15/06/2031" : new Date(Date.UTC(2031, 5, 15)), bad ? "0123" : `0770${String(1000000 + i)}`]);
  }
  return readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
}

beforeAll(async () => { await db.$connect(); });
beforeEach(async () => {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
});

describe("import wizard engine", () => {
  it("auto-maps Arabic and English headers", () => {
    const m = autoMap(HEAD);
    expect(m.firstName).toBe(0); expect(m.passportNo).toBe(6); expect(m.enSurname).toBe(8); expect(m.phone).toBe(10);
  });

  it("imports 200 rows, reports bad rows and detects duplicates", async () => {
    const [sheet] = await sample(200);
    const mapping = autoMap(sheet.headers);
    // 5 pre-existing pilgrims share passports with rows 0..4
    for (let i = 0; i < 5; i++) {
      await db.pilgrim.create({ data: { firstName: "قديم", fatherName: "أ", grandfatherName: "ب", familyName: "ج", gender: "MALE", birthDate: new Date("1970-01-01"),
        passportNo: `T${1000000 + i}`, enGivenName: "OLD", enSurname: "ONE", passportExpiry: new Date("2030-01-01") } });
    }
    const preview = await buildPreview(sheet.rows, mapping);
    expect(preview.total).toBe(200);
    expect(preview.invalid.length).toBe(4);
    expect(preview.invalid[0].errors.join()).toContain("الهاتف");
    expect(preview.duplicates.length).toBe(5);

    const r = await commitImport(user, sheet.rows, mapping, { 2: "update" }); // row 2 = first data row
    expect(r.updated).toBe(1);
    expect(r.skipped).toBe(4);
    expect(r.created).toBe(200 - 4 - 5);
    expect(await db.pilgrim.count()).toBe(5 + 191);
    const upd = await db.pilgrim.findUnique({ where: { passportNo: "T1000000" } });
    expect(upd?.firstName).toBe("محمد");
    expect(await db.auditLog.count({ where: { field: "firstName", entityId: upd!.id } })).toBe(1);
    expect((await errorReport(r.invalid)).length).toBeGreaterThan(100);
  });

  it("flags passport duplicated inside the file", async () => {
    const [sheet] = await sample(3);
    sheet.rows[2][6] = sheet.rows[0][6];
    const p = await buildPreview(sheet.rows, autoMap(sheet.headers));
    expect(p.invalid.some((r) => r.errors.join().includes("مكرر داخل الملف"))).toBe(true);
  });
});

describe("pilgrim rules", () => {
  const base = { firstName: "أ", fatherName: "ب", grandfatherName: "ج", familyName: "د", gender: "MALE", birthDate: "01/01/1980", passportNo: "x 123 45", enGivenName: "a", enSurname: "b", passportExpiry: "01/01/2032" };
  it("blocks duplicate passport with Arabic message", async () => {
    const a = pilgrimSchema.parse(base);
    expect(a.passportNo).toBe("X12345");
    expect((await createPilgrim(user, a)).ok).toBe(true);
    const r = await createPilgrim(user, pilgrimSchema.parse({ ...base, passportNo: "x12345" }));
    expect(r.error).toBe(DUPLICATE_PASSPORT_MSG);
    expect(await db.pilgrim.count()).toBe(1);
  });
  it("rejects bad Iraqi phone", () => {
    expect(pilgrimSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(pilgrimSchema.safeParse({ ...base, phone: "07701234567" }).success).toBe(true);
  });
  it("audits name and passport number changes", async () => {
    const created = await createPilgrim(user, pilgrimSchema.parse(base));
    const r = await updatePilgrim(user, created.id!, pilgrimSchema.parse({ ...base, firstName: "محمود", passportNo: "Z99999" }));
    expect(r.ok).toBe(true);
    const logs = await db.auditLog.findMany({ where: { entityId: created.id } });
    expect(logs.map((l) => l.field).sort()).toEqual(["firstName", "passportNo"]);
    expect(logs.find((l) => l.field === "passportNo")).toMatchObject({ oldValue: "X12345", newValue: "Z99999", userName: "مختبر" });
  });
  it("cannot change passport to one already used", async () => {
    await createPilgrim(user, pilgrimSchema.parse(base));
    const b = await createPilgrim(user, pilgrimSchema.parse({ ...base, passportNo: "Q77777" }));
    const r = await updatePilgrim(user, b.id!, pilgrimSchema.parse({ ...base, passportNo: "X12345" }));
    expect(r.error).toBe(DUPLICATE_PASSPORT_MSG);
  });
});
