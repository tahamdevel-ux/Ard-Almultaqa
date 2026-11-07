import ExcelJS from "exceljs";
import { pilgrimSchema } from "@/server/pilgrims";
import { normalizePassportNo } from "@/domain/passport";
import { IMPORT_FIELDS } from "./fields";
import { analyzeSheet, type Mapping, type SheetAnalysis } from "./headers";
import { isBlank, normalizeDate, normalizeGender, normalizeImportPhone, normalizeNationality, splitFullName, text, type Cell } from "./values";

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;
const SCAN_LIMIT = 20000;

export type { Mapping, Cell, SheetAnalysis };

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("result" in o) return cellValue(o.result as ExcelJS.CellValue);
    if ("text" in o) return String(o.text);
    return null;
  }
  return v as Cell;
}

export interface RawSheet { name: string; rows: Cell[][] }

/** All rows of every sheet, row 1 = index 0 (empty rows kept so row numbers match the spreadsheet). */
export async function readWorkbook(buf: Buffer): Promise<RawSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    const last = Math.min(ws.rowCount, SCAN_LIMIT);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const vals: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(row.getCell(c).value));
      rows.push(vals);
    }
    while (rows.length && rows[rows.length - 1].every(isBlank)) rows.pop();
    return { name: ws.name, rows };
  });
}

export function analyzeWorkbook(sheets: RawSheet[]): SheetAnalysis[] {
  return sheets.map((s) => analyzeSheet(s.name, s.rows));
}

export interface RowResult {
  rowNo: number; // spreadsheet row number
  data?: ReturnType<typeof pilgrimSchema.parse>;
  errors: string[];
  notes: string[];
  passportNo: string;
  name: string;
  junk?: boolean;
}

const labelOf = (k: string) => (k === "tripIds" ? "الرحلة" : IMPORT_FIELDS.find((f) => f.key === k)?.label ?? k);
const SAVED_FIELDS = IMPORT_FIELDS.filter((f) => f.key !== "fullNameAr" && f.key !== "fullNameEn").map((f) => f.key);

/** Turns spreadsheet rows into validated pilgrim data. Rows with almost nothing in the mapped columns are junk and dropped silently. */
export function validateRows(rows: { rowNo: number; cells: Cell[] }[], mapping: Mapping): RowResult[] {
  const seen = new Map<string, number>();
  const out: RowResult[] = [];
  for (const { rowNo, cells } of rows) {
    const get = (k: string): Cell => (mapping[k] == null ? null : cells[mapping[k]!] ?? null);
    const filled = Object.keys(mapping).filter((k) => mapping[k] != null && !isBlank(get(k))).length;
    if (filled < 2 && isBlank(get("passportNo"))) continue; // junk / totals / notes (a lone passport number is still reported)
    const raw: Record<string, unknown> = {};
    const notes: string[] = [];
    for (const k of SAVED_FIELDS) {
      const v = get(k);
      if (isBlank(v)) continue;
      if (k === "birthDate" || k === "passportIssue" || k === "passportExpiry") {
        const d = normalizeDate(v);
        raw[k] = d ?? text(v); // keep the original text so the error message shows what was wrong
      } else if (k === "gender") raw[k] = normalizeGender(v) ?? text(v);
      else if (k === "nationality") raw[k] = normalizeNationality(v);
      else if (k === "phone" || k === "emergencyPhone") {
        const p = normalizeImportPhone(v);
        if (p) raw[k] = p; else notes.push(`${labelOf(k)} غير صالح وتم تجاهله`);
      } else if (k === "passportNo") raw[k] = normalizePassportNo(typeof v === "number" ? String(v) : text(v));
      else raw[k] = text(v);
    }
    // full names fill only the parts the sheet doesn't give separately
    const fullAr = text(get("fullNameAr")), fullEn = text(get("fullNameEn"));
    if (fullAr) {
      const sp = splitFullName(fullAr, "ar");
      raw.firstName ??= sp.first; raw.fatherName ??= sp.father; raw.grandfatherName ??= sp.grandfather; raw.familyName ??= sp.family;
      if (sp.greatGrandfather) raw.greatGrandfatherName ??= sp.greatGrandfather;
    }
    if (fullEn) {
      const sp = splitFullName(fullEn, "en");
      raw.enGivenName ??= sp.first; raw.enFatherName ??= sp.father; raw.enGrandfatherName ??= sp.grandfather; raw.enSurname ??= sp.family;
    }
    raw.nationality ??= "IRAQI";
    raw.chronicIllness = false; raw.wheelchair = false; raw.elderly = false;
    const parsed = pilgrimSchema.safeParse(raw);
    const errors: string[] = [];
    if (!parsed.success) for (const e of parsed.error.issues) errors.push(`${labelOf(String(e.path[0]))}: ${e.message}`);
    const passportNo = parsed.success ? parsed.data.passportNo : String(raw.passportNo ?? "");
    if (passportNo) {
      const prev = seen.get(passportNo);
      if (prev) errors.push(`رقم الجواز مكرر داخل الملف (الصف ${prev})`);
      else seen.set(passportNo, rowNo);
    }
    out.push({
      rowNo, data: parsed.success && !errors.length ? parsed.data : undefined, errors, notes, passportNo,
      name: [raw.firstName, raw.fatherName, raw.familyName].filter(Boolean).join(" ") || fullAr || fullEn,
    });
  }
  return out;
}

export async function errorReport(rows: { rowNo: number; name: string; passportNo: string; errors: string[] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("الأخطاء", { views: [{ rightToLeft: true }] });
  ws.columns = [{ header: "رقم الصف", width: 10 }, { header: "الاسم", width: 30 }, { header: "رقم الجواز", width: 16 }, { header: "المشكلة", width: 70 }];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow([r.rowNo, r.name, r.passportNo, r.errors.join(" | ")]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
