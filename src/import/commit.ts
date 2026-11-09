import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { auditChanges, PILGRIM_AUDITED } from "@/server/audit";
import { addPilgrimToTrips } from "@/server/bookings";
import { assignOfficeRooms } from "@/officeRooms/service";
import { validateRows, type Mapping, type RowResult } from "./engine";
import type { Cell } from "./values";

/** What to do with a passport that is already registered: add him to the chosen trip as is (default), also refresh his data, or skip. */
export type ExistingDecision = "add" | "update" | "skip";
type SheetRow = { rowNo: number; cells: Cell[] };

export interface ExistingRow { rowNo: number; passportNo: string; name: string; existingId: string; existingName: string; onTrip: boolean; canUpdate: boolean }
export interface SampleRow { rowNo: number; name: string; passportNo: string; gender: string; birthDate: string; passportExpiry: string; phone: string }

export interface Preview {
  total: number; // meaningful rows (junk already dropped)
  fresh: number; // new pilgrims
  invalid: RowResult[];
  existing: ExistingRow[];
  notes: { rowNo: number; name: string; notes: string[] }[];
  sample: SampleRow[];
  results: RowResult[];
}

export async function buildPreview(rows: SheetRow[], mapping: Mapping, tripId: string): Promise<Preview> {
  const results = validateRows(rows, mapping);
  const withPassport = results.filter((r) => r.passportNo && !r.errors.some((e) => e.includes("مكرر داخل الملف")));
  const found = await db.pilgrim.findMany({
    where: { passportNo: { in: withPassport.map((r) => r.passportNo) } },
    select: { id: true, passportNo: true, firstName: true, fatherName: true, familyName: true, deletedAt: true, bookings: { where: { tripId, status: "ACTIVE", deletedAt: null }, select: { id: true } } },
  });
  const byPassport = new Map(found.map((p) => [p.passportNo, p]));
  const existing: ExistingRow[] = [];
  const invalid: RowResult[] = [];
  const fresh: RowResult[] = [];
  for (const r of results) {
    const e = r.passportNo ? byPassport.get(r.passportNo) : undefined;
    const dupInFile = r.errors.some((x) => x.includes("مكرر داخل الملف"));
    if (e && !dupInFile) {
      if (e.deletedAt) { invalid.push({ ...r, errors: [...r.errors, "المعتمر محذوف سابقاً — استعده من شاشة المعتمرين أولاً"] }); continue; }
      existing.push({ rowNo: r.rowNo, passportNo: r.passportNo, name: r.name, existingId: e.id, existingName: `${e.firstName} ${e.fatherName} ${e.familyName}`, onTrip: e.bookings.length > 0, canUpdate: !!r.data });
    } else if (!r.data) invalid.push(r);
    else fresh.push(r);
  }
  const sample = fresh.slice(0, 10).map((r) => ({
    rowNo: r.rowNo, name: r.name, passportNo: r.passportNo, gender: r.data!.gender === "MALE" ? "ذكر" : "أنثى",
    birthDate: r.data!.birthDate.toISOString().slice(0, 10), passportExpiry: r.data!.passportExpiry.toISOString().slice(0, 10), phone: r.data!.phone ?? "",
  }));
  const notes = results.filter((r) => r.notes.length).map((r) => ({ rowNo: r.rowNo, name: r.name, notes: r.notes }));
  return { total: results.length, fresh: fresh.length, invalid, existing, notes, sample, results };
}

export interface ImportOutcome { created: number; addedExisting: number; updated: number; alreadyOnTrip: number; skipped: number; invalid: RowResult[] }

/** All-or-nothing: any DB failure rolls back the whole import. Invalid rows are skipped and reported. */
export async function commitImport(user: SessionUser, rows: SheetRow[], mapping: Mapping, tripId: string, decisions: Record<number, ExistingDecision>, defaultDecision: ExistingDecision = "add"): Promise<ImportOutcome> {
  const trip = await db.trip.findFirst({ where: { id: tripId, deletedAt: null } });
  if (!trip) throw new Error("trip not found");
  const preview = await buildPreview(rows, mapping, tripId);
  const resultByRow = new Map(preview.results.map((r) => [r.rowNo, r]));
  const invalidRows = new Set(preview.invalid.map((r) => r.rowNo));
  const existingRows = new Set(preview.existing.map((e) => e.rowNo));
  const out: ImportOutcome = { created: 0, addedExisting: 0, updated: 0, alreadyOnTrip: 0, skipped: 0, invalid: preview.invalid };
  await db.$transaction(async (tx) => {
    const newBookings: string[] = [];
    for (const r of preview.results) {
      if (invalidRows.has(r.rowNo) || existingRows.has(r.rowNo) || !r.data) continue;
      const p = await tx.pilgrim.create({ data: r.data as Prisma.PilgrimUncheckedCreateInput });
      const added = await addPilgrimToTrips(tx, p.id, p.agentId, [tripId], { officeRooms: false });
      if (added.bookingIds?.[tripId]) newBookings.push(added.bookingIds[tripId]);
      out.created++;
    }
    for (const e of preview.existing) {
      const decision = decisions[e.rowNo] ?? defaultDecision;
      if (decision === "skip") { out.skipped++; continue; }
      const data = resultByRow.get(e.rowNo)?.data;
      if (decision === "update" && data) {
        const before = await tx.pilgrim.findUniqueOrThrow({ where: { id: e.existingId } });
        const after = await tx.pilgrim.update({ where: { id: e.existingId }, data: data as Prisma.PilgrimUncheckedUpdateInput });
        await auditChanges(tx, user, "Pilgrim", e.existingId, before, after, PILGRIM_AUDITED);
        out.updated++;
      }
      const pil = await tx.pilgrim.findUniqueOrThrow({ where: { id: e.existingId }, select: { agentId: true } });
      const r = await addPilgrimToTrips(tx, e.existingId, pil.agentId, [tripId], { officeRooms: false });
      if (r.added.length) { out.addedExisting++; if (r.bookingIds?.[tripId]) newBookings.push(r.bookingIds[tripId]); } else out.alreadyOnTrip++;
    }
    // office rooms: all imported bookings are placed at the end, in the same transaction
    await assignOfficeRooms(tx, tripId, newBookings);
  }, { timeout: 300_000, maxWait: 30_000 });
  return out;
}
