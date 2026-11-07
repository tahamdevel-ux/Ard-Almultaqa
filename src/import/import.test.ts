import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { analyzeWorkbook, readWorkbook, errorReport } from "./engine";
import { analyzeSheet, guessMapping } from "./headers";
import { autoMap } from "./fields";
import { buildPreview, commitImport } from "./commit";
import { normalizeDate, normalizeGender, normalizeImportPhone, normalizeNationality, splitFullName } from "./values";
import { createPilgrim, pilgrimSchema, updatePilgrim, DUPLICATE_PASSPORT_MSG } from "@/server/pilgrims";

const user = { id: "u1", username: "t", name: "مختبر", role: "ADMIN" as const };

// Synthetic file that mirrors the 57-column layout of the real exports (fake people only).
const H57 = ["[]", "Y", "Passport Number", "Title", "AFull Name", "First Name (A)", "Father Name (A)", "Third Name (A)", "Last Name (A)", "Full Name", "First Name (E)", "Father Name (E)", "Third Name (E)", "Last Name (E)",
  "Nationality", "Prev. Nationality", "Birth Place", "Birth Date", "Issue Place", "Issue Date", "Expiry Date", "Martial Status", "Gender", "Education", "Occupation", "Mahram", "Relation", "Client", "Companion serial",
  "Passport Type", "Issue Country", "Job", "National Id", "Age", "Mofa", "E-Number", "Makkah Hotel", "Makkah Entry Date", "Room Type", "Room Number", "Nights Count", "Madina Hotel", "Madina Entry Date", "Room Type", "Room Number",
  "Nights Count", "Azizia Hotel", "Azizia Entry Date", "Room Type", "Room Number", "Nights Count", "Group Name", "Visa Number", "Visa Date", "Visa Duration", "Mother", "Phone"];

function row57(i: number, o: { passport?: string; birth?: unknown; issue?: unknown; expiry?: unknown; gender?: string; phone?: unknown; nat?: string; first?: string; third?: string } = {}) {
  const r: unknown[] = Array(57).fill(null);
  r[0] = i + 1; r[1] = "Y"; r[2] = o.passport ?? `Z${String(5000000 + i)}`;
  r[4] = "تجريب كامل"; r[5] = o.first ?? "تجريب"; r[6] = "علي"; r[7] = o.third ?? "حسن"; r[8] = "الاختبار"; r[9] = "TEST ALI HASSAN ALEKHTIBAR";
  r[10] = "TEST"; r[11] = "ALI"; r[12] = "HASSAN"; r[13] = "ALEKHTIBAR"; r[14] = o.nat ?? "Iraq"; r[15] = "Iraq"; r[16] = "العراق";
  r[17] = o.birth ?? "07-01-1963"; r[19] = o.issue ?? "21-09-2025"; r[20] = o.expiry ?? "20-09-2033"; r[22] = o.gender ?? "Male";
  r[25] = "مرافق وهمي"; r[26] = "Husband"; r[27] = "عميل"; r[33] = "63"; r[35] = "E1234"; r[36] = "Hotel X"; r[51] = "مجموعة اختبار"; r[52] = "6177083298"; r[55] = "أم الاختبار"; r[56] = o.phone ?? null;
  return r;
}

async function book(sheets: { name: string; rows: unknown[][] }[]) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) { const ws = wb.addWorksheet(s.name); for (const r of s.rows) ws.addRow(r as never); }
  return readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
}

async function trip(name = "رحلة الاختبار") { return db.trip.create({ data: { name, transportType: "AIR", capacity: 100 } }); }

beforeAll(async () => { await db.$connect(); });
beforeEach(async () => {
  await db.payment.deleteMany(); await db.auditLog.deleteMany(); await db.seatAssignment.deleteMany(); await db.booking.deleteMany(); await db.bus.deleteMany();
  await db.tripPrice.deleteMany(); await db.trip.deleteMany(); await db.pilgrim.deleteMany();
});

describe("value normalizers", () => {
  it("dates: Date objects, serials, text in several forms, Arabic digits", () => {
    expect(normalizeDate(new Date(Date.UTC(1963, 0, 7)))).toBe("07/01/1963");
    expect(normalizeDate("21-09-2025")).toBe("21/09/2025");
    expect(normalizeDate("1963-01-07 00:00:00")).toBe("07/01/1963");
    expect(normalizeDate("٠٧/٠١/١٩٦٣")).toBe("07/01/1963");
    expect(normalizeDate(23378)).toBe("02/01/1964"); // Excel serial
    expect(normalizeDate("31-02-2020")).toBeNull();
    expect(normalizeDate("hello")).toBeNull();
  });
  it("gender, nationality, phone", () => {
    expect(normalizeGender("Male")).toBe("MALE"); expect(normalizeGender("ذكر")).toBe("MALE");
    expect(normalizeGender("Female")).toBe("FEMALE"); expect(normalizeGender("أنثى")).toBe("FEMALE"); expect(normalizeGender("?")).toBeNull();
    expect(normalizeNationality("Iraq")).toBe("IRAQI"); expect(normalizeNationality("عراقي")).toBe("IRAQI"); expect(normalizeNationality("Syria")).toBe("SYRIA");
    expect(normalizeImportPhone(7701234567)).toBe("07701234567");
    expect(normalizeImportPhone("+964 770 123 4567")).toBe("07701234567");
    expect(normalizeImportPhone("٠٧٧٠١٢٣٤٥٦٧")).toBe("07701234567");
    expect(normalizeImportPhone("123")).toBeNull();
  });
  it("splits full names, keeping compound names together", () => {
    expect(splitFullName("صلاح الدين محمد ابراهيم رشيد", "ar")).toMatchObject({ first: "صلاح الدين", father: "محمد", grandfather: "ابراهيم", family: "رشيد" });
    expect(splitFullName("عبد الله سالم محمود المولى", "ar")).toMatchObject({ first: "عبد الله", father: "سالم", grandfather: "محمود", family: "المولى" });
    expect(splitFullName("AHMED ALI HASSAN ALMOSULI", "en")).toMatchObject({ first: "AHMED", father: "ALI", grandfather: "HASSAN", family: "ALMOSULI" });
    expect(splitFullName("أحمد علي حسن محمود الجبوري", "ar")).toMatchObject({ greatGrandfather: "محمود", family: "الجبوري" });
  });
});

describe("smart sheet reading", () => {
  it("maps the 57-column layout and ignores visa/mahram/group/hotel columns", async () => {
    const [raw] = await book([{ name: "Sheet1", rows: [H57, row57(0), row57(1)] }]);
    const a = analyzeSheet(raw.name, raw.rows);
    expect(a.headerRow).toBe(1);
    const m = a.mapping;
    expect(m.passportNo).toBe(2); expect(m.firstName).toBe(5); expect(m.fatherName).toBe(6); expect(m.grandfatherName).toBe(7); expect(m.familyName).toBe(8);
    expect(m.enGivenName).toBe(10); expect(m.enFatherName).toBe(11); expect(m.enGrandfatherName).toBe(12); expect(m.enSurname).toBe(13);
    expect(m.birthDate).toBe(17); expect(m.passportIssue).toBe(19); expect(m.passportExpiry).toBe(20); expect(m.gender).toBe(22); expect(m.nationality).toBe(14);
    expect(m.motherName).toBe(55); expect(m.phone).toBe(56);
    const mapped = new Set(Object.values(m));
    for (const ignored of [25, 26, 27, 33, 35, 36, 51, 52]) expect(mapped.has(ignored)).toBe(false);
    expect(a.ready).toBe(true);
  });

  it("finds the header row when it is not row 1, and skips junk rows silently", async () => {
    const rows = [["قائمة معتمرين — شركة اختبار"], [], ["تاريخ الطباعة", "01/01/2026"], H57, row57(0), row57(1), [], ["المجموع", 2], row57(2)];
    const [raw] = await book([{ name: "Sheet1", rows }]);
    const a = analyzeSheet(raw.name, raw.rows);
    expect(a.headerRow).toBe(4);
    const t = await trip();
    const p = await buildPreview(a.dataRows, a.mapping, t.id);
    expect(p.total).toBe(3); // the total line is junk
    expect(p.invalid).toHaveLength(0);
    expect(p.fresh).toBe(3);
  });

  it("handles several sheets: the best one is chosen", async () => {
    const sheets = await book([{ name: "ملاحظات", rows: [["ملاحظة"], ["لا شيء"]] }, { name: "المعتمرين", rows: [H57, row57(0)] }]);
    const an = analyzeWorkbook(sheets);
    const best = an.reduce((b, x) => (x.score > b.score ? x : b));
    expect(best.name).toBe("المعتمرين");
    expect(an[0].ready).toBe(false);
  });

  it("recognises Arabic headers and full-name columns", async () => {
    const head = ["#", "الاسم الكامل", "الاسم بالانكليزي", "رقم الجواز", "الجنس", "تاريخ الميلاد", "تاريخ الانتهاء", "رقم الهاتف"];
    const rows = [head, [1, "عبد الله سالم محمود المولى", "ABDULLAH SALIM MAHMOOD ALMULA", "A1234567", "ذكر", "05/04/1970", "01/01/2032", 7701234567]];
    const [raw] = await book([{ name: "S", rows }]);
    const a = analyzeSheet(raw.name, raw.rows);
    expect(a.mapping.fullNameAr).toBe(1); expect(a.mapping.fullNameEn).toBe(2); expect(a.mapping.passportNo).toBe(3);
    const t = await trip();
    const p = await buildPreview(a.dataRows, a.mapping, t.id);
    expect(p.invalid).toHaveLength(0);
    const d = p.results[0].data!;
    expect(d.firstName).toBe("عبد الله"); expect(d.familyName).toBe("المولى"); expect(d.enGivenName).toBe("ABDULLAH"); expect(d.phone).toBe("07701234567");
  });

  it("falls back to cell content when headers are unusable", async () => {
    const rows = [["a", "b", "c", "d", "e", "f"], ["XA1234567", "Male", "07-01-1963", "21-09-2025", "20-09-2033", "07701234567"], ["XA1234568", "Female", "12-05-1975", "01-02-2024", "31-01-2032", "07801234567"], ["XA1234569", "Male", "01-01-1980", "03-03-2023", "02-03-2031", "07901234567"]];
    const [raw] = await book([{ name: "S", rows }]);
    const g = guessMapping(raw.rows[0].map(String), raw.rows.slice(1));
    expect(g.mapping.passportNo).toBe(0); expect(g.mapping.gender).toBe(1); expect(g.mapping.birthDate).toBe(2);
    expect(g.mapping.passportIssue).toBe(3); expect(g.mapping.passportExpiry).toBe(4); expect(g.mapping.phone).toBe(5);
    expect(g.sources.passportNo).toBe("content");
  });
});

describe("import into a trip", () => {
  it("normalises mixed formats and drops an invalid phone without blocking", async () => {
    const rows = [H57,
      row57(0, { birth: new Date(Date.UTC(1963, 0, 7)), issue: "21-09-2025", expiry: 47000, gender: "Female", phone: 7701234567 }),
      row57(1, { birth: "1963-01-07 00:00:00", gender: "ذكر", phone: "12345", nat: "عراقي" })];
    const [raw] = await book([{ name: "S", rows }]);
    const a = analyzeSheet(raw.name, raw.rows);
    const t = await trip();
    const r = await commitImport(user, a.dataRows, a.mapping, t.id, {});
    expect(r.created).toBe(2); expect(r.invalid).toHaveLength(0);
    const p0 = await db.pilgrim.findUniqueOrThrow({ where: { passportNo: "Z5000000" } });
    expect(p0.gender).toBe("FEMALE"); expect(p0.phone).toBe("07701234567"); expect(p0.nationality).toBe("IRAQI");
    expect(p0.passportExpiry.getUTCFullYear()).toBe(2028);
    const p1 = await db.pilgrim.findUniqueOrThrow({ where: { passportNo: "Z5000001" } });
    expect(p1.phone).toBeNull();
    expect(await db.booking.count({ where: { tripId: t.id } })).toBe(2);
  });

  it("existing passports: added to the trip with their data untouched; already on the trip is skipped", async () => {
    const t = await trip(), other = await trip("رحلة أخرى");
    const old = await db.pilgrim.create({ data: { firstName: "قديم", fatherName: "أ", grandfatherName: "ب", familyName: "ج", gender: "MALE", birthDate: new Date("1970-01-01"),
      passportNo: "Z5000000", enGivenName: "OLD", enSurname: "ONE", passportExpiry: new Date("2030-01-01") } });
    const onTrip = await db.pilgrim.create({ data: { firstName: "موجود", fatherName: "أ", grandfatherName: "ب", familyName: "ج", gender: "MALE", birthDate: new Date("1970-01-01"),
      passportNo: "Z5000001", enGivenName: "HERE", enSurname: "ONE", passportExpiry: new Date("2030-01-01") } });
    await db.booking.create({ data: { pilgrimId: onTrip.id, tripId: t.id } });
    await db.booking.create({ data: { pilgrimId: old.id, tripId: other.id } }); // other trips never block
    const [raw] = await book([{ name: "S", rows: [H57, row57(0), row57(1), row57(2)] }]);
    const a = analyzeSheet(raw.name, raw.rows);
    const pv = await buildPreview(a.dataRows, a.mapping, t.id);
    expect(pv.fresh).toBe(1); expect(pv.existing).toHaveLength(2); expect(pv.existing.find((e) => e.passportNo === "Z5000001")!.onTrip).toBe(true);
    const r = await commitImport(user, a.dataRows, a.mapping, t.id, {});
    expect(r).toMatchObject({ created: 1, addedExisting: 1, alreadyOnTrip: 1, updated: 0 });
    expect((await db.pilgrim.findUniqueOrThrow({ where: { id: old.id } })).firstName).toBe("قديم"); // untouched
    expect(await db.booking.count({ where: { pilgrimId: old.id } })).toBe(2);
    expect(await db.booking.count({ where: { tripId: t.id } })).toBe(3);
  });

  it("'update' refreshes the data (audited) and adds to the trip; 'skip' does nothing", async () => {
    const t = await trip();
    const mk = (no: string) => db.pilgrim.create({ data: { firstName: "قديم", fatherName: "أ", grandfatherName: "ب", familyName: "ج", gender: "MALE", birthDate: new Date("1970-01-01"),
      passportNo: no, enGivenName: "OLD", enSurname: "ONE", passportExpiry: new Date("2030-01-01") } });
    const u = await mk("Z5000000"); const sk = await mk("Z5000001");
    const [raw] = await book([{ name: "S", rows: [H57, row57(0), row57(1)] }]);
    const a = analyzeSheet(raw.name, raw.rows);
    const rowNos = a.dataRows.map((x) => x.rowNo);
    const r = await commitImport(user, a.dataRows, a.mapping, t.id, { [rowNos[0]]: "update", [rowNos[1]]: "skip" });
    expect(r).toMatchObject({ updated: 1, addedExisting: 1, skipped: 1 });
    expect((await db.pilgrim.findUniqueOrThrow({ where: { id: u.id } })).firstName).toBe("تجريب");
    expect(await db.auditLog.count({ where: { entityId: u.id, field: "firstName" } })).toBe(1);
    expect(await db.booking.count({ where: { pilgrimId: sk.id } })).toBe(0);
  });

  it("reports bad rows, in-file duplicates and a missing passport, all-or-nothing otherwise", async () => {
    const t = await trip();
    const rows = [H57, row57(0), row57(1, { passport: "Z5000000" }), row57(2, { birth: "99-99-9999" }), row57(3, { passport: "" })];
    const [raw] = await book([{ name: "S", rows }]);
    const a = analyzeSheet(raw.name, raw.rows);
    const pv = await buildPreview(a.dataRows, a.mapping, t.id);
    expect(pv.fresh).toBe(1);
    expect(pv.invalid.map((r) => r.errors.join())).toEqual(expect.arrayContaining([expect.stringContaining("مكرر داخل الملف"), expect.stringContaining("تاريخ الميلاد"), expect.stringContaining("رقم الجواز")]));
    const r = await commitImport(user, a.dataRows, a.mapping, t.id, {});
    expect(r.created).toBe(1);
    expect((await errorReport(r.invalid)).length).toBeGreaterThan(100);
  });

  it("autoMap keeps working for plain Arabic headers", () => {
    const m = autoMap(["الاسم الأول", "اسم الأب", "اسم الجد", "اللقب", "الجنس", "تاريخ الميلاد", "رقم الجواز", "Given name", "Surname", "تاريخ الانتهاء", "الهاتف"]);
    expect(m.firstName).toBe(0); expect(m.passportNo).toBe(6); expect(m.enSurname).toBe(8); expect(m.phone).toBe(10); expect(m.enGivenName).toBe(7);
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
