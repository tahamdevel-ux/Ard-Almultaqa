import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { auditChanges, PILGRIM_AUDITED } from "@/server/audit";
import type { Prisma } from "@prisma/client";
import { validateRows, type Cell, type Mapping, type RowResult } from "./engine";

export type DupDecision = "skip" | "update";

export interface Preview {
  total: number;
  valid: RowResult[];
  invalid: RowResult[];
  duplicates: (RowResult & { existingId: string; existingName: string })[];
  fresh: number;
}

export async function buildPreview(rows: Cell[][], mapping: Mapping): Promise<Preview> {
  const results = validateRows(rows, mapping);
  const valid = results.filter((r) => r.data);
  const invalid = results.filter((r) => !r.data);
  const existing = await db.pilgrim.findMany({ where: { passportNo: { in: valid.map((v) => v.data!.passportNo) } }, select: { id: true, passportNo: true, firstName: true, fatherName: true, familyName: true } });
  const byPassport = new Map(existing.map((e) => [e.passportNo, e]));
  const duplicates = valid.filter((v) => byPassport.has(v.data!.passportNo)).map((v) => {
    const e = byPassport.get(v.data!.passportNo)!;
    return { ...v, existingId: e.id, existingName: `${e.firstName} ${e.fatherName} ${e.familyName}` };
  });
  return { total: results.length, valid, invalid, duplicates, fresh: valid.length - duplicates.length };
}

/** All-or-nothing: any DB failure rolls back the whole import. Invalid rows are skipped and reported. */
export async function commitImport(user: SessionUser, rows: Cell[][], mapping: Mapping, decisions: Record<number, DupDecision>) {
  const preview = await buildPreview(rows, mapping);
  const dupByRow = new Map(preview.duplicates.map((d) => [d.rowNo, d]));
  let created = 0, updated = 0, skipped = 0;
  await db.$transaction(async (tx) => {
    for (const r of preview.valid) {
      const dup = dupByRow.get(r.rowNo);
      if (!dup) {
        await tx.pilgrim.create({ data: r.data as Prisma.PilgrimUncheckedCreateInput });
        created++;
      } else if (decisions[r.rowNo] === "update") {
        const before = await tx.pilgrim.findUniqueOrThrow({ where: { id: dup.existingId } });
        const after = await tx.pilgrim.update({ where: { id: dup.existingId }, data: r.data as Prisma.PilgrimUncheckedUpdateInput });
        await auditChanges(tx, user, "Pilgrim", dup.existingId, before, after, PILGRIM_AUDITED);
        updated++;
      } else skipped++;
    }
  }, { timeout: 120_000 });
  return { created, updated, skipped, invalid: preview.invalid };
}
