import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";

type Tx = Prisma.TransactionClient;

const str = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

/** Writes one AuditLog row per changed field among `fields`. */
export async function auditChanges(
  tx: Tx,
  user: Pick<SessionUser, "id" | "name"> | null,
  entity: string,
  entityId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
) {
  const rows = fields
    .filter((f) => str(before[f]) !== str(after[f]))
    .map((f) => ({
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      entity,
      entityId,
      field: f,
      oldValue: str(before[f]),
      newValue: str(after[f]),
    }));
  if (rows.length) await tx.auditLog.createMany({ data: rows });
}

export const PILGRIM_AUDITED = [
  "firstName", "fatherName", "grandfatherName", "greatGrandfatherName", "familyName",
  "passportNo", "enGivenName", "enFatherName", "enGrandfatherName", "enSurname",
  "nationality", "placeOfBirth", "passportIssue", "passportExpiry", "passportAuthority",
  "birthDate", "gender", "phone",
] as const;
