"use server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { getFile, putFile } from "@/server/storage";
import { errorReport, MAX_BYTES, MAX_ROWS, readWorkbook, type Mapping } from "@/import/engine";
import { autoMap } from "@/import/fields";
import { buildPreview, commitImport, type DupDecision, type Preview } from "@/import/commit";

export interface UploadResult { error?: string; key?: string; sheets?: { name: string; headers: string[]; rowCount: number; guess: Mapping }[] }

export async function uploadWorkbook(_p: UploadResult, form: FormData): Promise<UploadResult> {
  try { await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "اختر ملف Excel" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "الملف يجب أن يكون بصيغة xlsx" };
  if (file.size > MAX_BYTES) return { error: "حجم الملف أكبر من 5 ميغابايت" };
  const buf = Buffer.from(await file.arrayBuffer());
  let sheets;
  try { sheets = await readWorkbook(buf); } catch { return { error: "تعذّر قراءة الملف" }; }
  if (!sheets.length) return { error: "الملف لا يحتوي على أوراق" };
  const big = sheets.find((s) => s.rows.length > MAX_ROWS);
  if (big) return { error: `الورقة «${big.name}» تحتوي أكثر من ${MAX_ROWS} صف` };
  const key = await putFile(buf, "xlsx");
  return { key, sheets: sheets.map((s) => ({ name: s.name, headers: s.headers, rowCount: s.rows.length, guess: autoMap(s.headers) })) };
}

async function sheetRows(key: string, sheetName: string) {
  const sheets = await readWorkbook(await getFile(key));
  const s = sheets.find((x) => x.name === sheetName);
  if (!s) throw new Error("sheet not found");
  return s.rows;
}

export interface PreviewResult { error?: string; preview?: Pick<Preview, "total" | "fresh"> & {
  invalid: { rowNo: number; name: string; passportNo: string; errors: string[] }[];
  duplicates: { rowNo: number; name: string; passportNo: string; existingName: string }[];
} }

export async function previewImport(key: string, sheet: string, mapping: Mapping): Promise<PreviewResult> {
  try { await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  const required = ["firstName", "fatherName", "grandfatherName", "familyName", "gender", "birthDate", "passportNo", "enGivenName", "enSurname", "passportExpiry"];
  const missing = required.filter((k) => mapping[k] == null);
  if (missing.length) return { error: "اربط الأعمدة المطلوبة (*) أولاً" };
  const p = await buildPreview(await sheetRows(key, sheet), mapping);
  return { preview: {
    total: p.total, fresh: p.fresh,
    invalid: p.invalid.map((r) => ({ rowNo: r.rowNo, name: r.name, passportNo: r.passportNo, errors: r.errors })),
    duplicates: p.duplicates.map((r) => ({ rowNo: r.rowNo, name: r.name, passportNo: r.passportNo, existingName: r.existingName })),
  } };
}

export interface CommitResult { error?: string; created?: number; updated?: number; skipped?: number; invalidCount?: number; reportKey?: string }

export async function runImport(key: string, sheet: string, mapping: Mapping, decisions: Record<number, DupDecision>): Promise<CommitResult> {
  let user;
  try { user = await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  try {
    const r = await commitImport(user, await sheetRows(key, sheet), mapping, decisions);
    let reportKey: string | undefined;
    if (r.invalid.length) reportKey = await putFile(await errorReport(r.invalid), "xlsx");
    return { created: r.created, updated: r.updated, skipped: r.skipped, invalidCount: r.invalid.length, reportKey };
  } catch (e) {
    console.error(e);
    return { error: "فشل الاستيراد وتم التراجع عن كل التغييرات" };
  }
}

export async function saveMapping(name: string, mapping: Mapping) {
  await requirePermission("import.run");
  if (!name.trim()) return;
  await db.importMapping.upsert({ where: { name }, create: { name, mapping }, update: { mapping } });
}
export async function listMappings() {
  await requirePermission("import.run");
  return (await db.importMapping.findMany({ orderBy: { name: "asc" } })).map((m) => ({ name: m.name, mapping: m.mapping as Mapping }));
}
