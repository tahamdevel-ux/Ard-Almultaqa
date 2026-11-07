"use server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { getFile, putFile } from "@/server/storage";
import { analyzeSheet } from "@/import/headers";
import { analyzeWorkbook, errorReport, MAX_BYTES, MAX_ROWS, readWorkbook, type Mapping } from "@/import/engine";
import type { MapSource } from "@/import/headers";
import { buildPreview, commitImport, type ExistingDecision, type ExistingRow, type SampleRow } from "@/import/commit";

export interface SheetSummary { name: string; headerRow: number; headers: string[]; rowCount: number; mapping: Mapping; sources: Record<string, MapSource>; ready: boolean }
export interface UploadResult { error?: string; key?: string; best?: number; sheets?: SheetSummary[] }

const summarize = (a: ReturnType<typeof analyzeSheet>): SheetSummary => ({ name: a.name, headerRow: a.headerRow, headers: a.headers, rowCount: a.dataRows.length, mapping: a.mapping, sources: a.sources, ready: a.ready });

export async function uploadWorkbook(_p: UploadResult, form: FormData): Promise<UploadResult> {
  try { await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "اختر ملف Excel" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "الملف يجب أن يكون بصيغة xlsx" };
  if (file.size > MAX_BYTES) return { error: "حجم الملف أكبر من 5 ميغابايت" };
  const buf = Buffer.from(await file.arrayBuffer());
  let analyses;
  try { analyses = analyzeWorkbook(await readWorkbook(buf)); } catch { return { error: "تعذّر قراءة الملف" }; }
  if (!analyses.length) return { error: "الملف لا يحتوي على أوراق" };
  const big = analyses.find((s) => s.dataRows.length > MAX_ROWS);
  if (big) return { error: `الورقة «${big.name}» تحتوي أكثر من ${MAX_ROWS} صف` };
  const key = await putFile(buf, "xlsx");
  let best = 0;
  analyses.forEach((a, i) => { if (a.score > analyses[best].score) best = i; });
  return { key, best, sheets: analyses.map(summarize) };
}

async function loadSheet(key: string, sheetName: string, headerRow?: number) {
  const sheets = await readWorkbook(await getFile(key));
  const s = sheets.find((x) => x.name === sheetName);
  if (!s) throw new Error("sheet not found");
  return analyzeSheet(s.name, s.rows, headerRow);
}

/** The user moved the header row: re-detect the columns from there. */
export async function reanalyzeSheet(key: string, sheet: string, headerRow: number): Promise<{ error?: string; sheet?: SheetSummary }> {
  try { await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow > 200) return { error: "رقم صف غير صحيح" };
  return { sheet: summarize(await loadSheet(key, sheet, headerRow)) };
}

export interface PreviewResult { error?: string; preview?: {
  total: number; fresh: number; ignoredNote?: string;
  invalid: { rowNo: number; name: string; passportNo: string; errors: string[] }[];
  existing: ExistingRow[];
  notes: { rowNo: number; name: string; notes: string[] }[];
  sample: SampleRow[];
  tripName: string;
} }

async function requireTrip(tripId: string) {
  const t = tripId ? await db.trip.findFirst({ where: { id: tripId, deletedAt: null } }) : null;
  return t;
}

export async function previewImport(key: string, sheet: string, headerRow: number, mapping: Mapping, tripId: string): Promise<PreviewResult> {
  try { await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  const trip = await requireTrip(tripId);
  if (!trip) return { error: "اختر الرحلة التي سيُضاف إليها المعتمرون" };
  if (mapping.passportNo == null) return { error: "حدّد عمود رقم الجواز" };
  const a = await loadSheet(key, sheet, headerRow);
  const p = await buildPreview(a.dataRows, mapping, tripId);
  return { preview: {
    total: p.total, fresh: p.fresh, tripName: trip.name,
    invalid: p.invalid.map((r) => ({ rowNo: r.rowNo, name: r.name, passportNo: r.passportNo, errors: r.errors })),
    existing: p.existing, notes: p.notes, sample: p.sample,
  } };
}

export interface CommitResult { error?: string; created?: number; addedExisting?: number; updated?: number; alreadyOnTrip?: number; skipped?: number; invalidCount?: number; reportKey?: string; tripId?: string }

export async function runImport(key: string, sheet: string, headerRow: number, mapping: Mapping, tripId: string, decisions: Record<number, ExistingDecision>, defaultDecision: ExistingDecision): Promise<CommitResult> {
  let user;
  try { user = await requirePermission("import.run"); } catch (e) { if (e instanceof AuthError) return { error: e.message }; throw e; }
  if (!(await requireTrip(tripId))) return { error: "اختر الرحلة التي سيُضاف إليها المعتمرون" };
  try {
    const a = await loadSheet(key, sheet, headerRow);
    const r = await commitImport(user, a.dataRows, mapping, tripId, decisions, defaultDecision);
    let reportKey: string | undefined;
    if (r.invalid.length) reportKey = await putFile(await errorReport(r.invalid), "xlsx");
    return { created: r.created, addedExisting: r.addedExisting, updated: r.updated, alreadyOnTrip: r.alreadyOnTrip, skipped: r.skipped, invalidCount: r.invalid.length, reportKey, tripId };
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
