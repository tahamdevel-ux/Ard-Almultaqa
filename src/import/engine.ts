import ExcelJS from "exceljs";
import { pilgrimSchema } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { IMPORT_FIELDS } from "./fields";

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

export type Mapping = Record<string, number | null>;
export type Cell = string | number | boolean | Date | null;

export interface SheetData { name: string; headers: string[]; rows: Cell[][] }

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

export async function readWorkbook(buf: Buffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const all: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(row.getCell(c).value));
      all.push(vals);
    });
    const [head = [], ...rows] = all;
    return { name: ws.name, headers: head.map((h) => (h == null ? "" : String(h).trim())), rows };
  });
}

function asText(key: string, v: Cell): string {
  if (v == null) return "";
  if (v instanceof Date) return formatDate(v);
  if (typeof v === "number") return String(v);
  const s = String(v).trim();
  if (key === "gender") {
    if (/^(ذكر|male|m|ر)$/i.test(s)) return "MALE";
    if (/^(انثى|أنثى|female|f|ث)$/i.test(s)) return "FEMALE";
  }
  return s;
}
export interface RowResult {
  rowNo: number; // 1-based sheet row number incl. header
  data?: ReturnType<typeof pilgrimSchema.parse>;
  errors: string[];
  passportNo: string;
  name: string;
}

export function validateRows(rows: Cell[][], mapping: Mapping): RowResult[] {
  const seen = new Map<string, number>();
  const out: RowResult[] = [];
  rows.forEach((r, i) => {
    if (r.every((c) => c == null || String(c).trim() === "")) return;
    const raw: Record<string, unknown> = {};
    for (const f of IMPORT_FIELDS) {
      const idx = mapping[f.key];
      if (idx == null) continue;
      const v = r[idx];
      raw[f.key] = v instanceof Date ? formatDate(v) : asText(f.key, v ?? null);
    }
    raw.chronicIllness = false; raw.wheelchair = false; raw.elderly = false;
    const parsed = pilgrimSchema.safeParse(raw);
    const errors: string[] = [];
    if (!parsed.success) for (const e of parsed.error.issues) errors.push(`${labelOf(String(e.path[0]))}: ${e.message}`);
    const passportNo = parsed.success ? parsed.data.passportNo : String(raw.passportNo ?? "");
    if (parsed.success) {
      const prev = seen.get(passportNo);
      if (prev) errors.push(`رقم الجواز مكرر داخل الملف (الصف ${prev})`);
      else seen.set(passportNo, i + 2);
    }
    out.push({ rowNo: i + 2, data: parsed.success && !errors.length ? parsed.data : undefined, errors, passportNo,
      name: [raw.firstName, raw.fatherName, raw.familyName].filter(Boolean).join(" ") });
  });
  return out;
}

const labelOf = (k: string) => IMPORT_FIELDS.find((f) => f.key === k)?.label ?? k;

export async function errorReport(rows: { rowNo: number; name: string; passportNo: string; errors: string[] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("الأخطاء", { views: [{ rightToLeft: true }] });
  ws.columns = [{ header: "رقم الصف", width: 10 }, { header: "الاسم", width: 30 }, { header: "رقم الجواز", width: 16 }, { header: "المشكلة", width: 70 }];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow([r.rowNo, r.name, r.passportNo, r.errors.join(" | ")]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
