import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { auditChanges, PILGRIM_AUDITED } from "./audit";
import { isEmergencyPhone, isIraqiMobile, normalizePhone } from "@/domain/phone";
import { normalizePassportNo } from "@/domain/passport";
import { parseDate } from "@/domain/dates";

const opt = z.string().trim().optional().transform((v) => (v ? v : undefined));
const dateField = (msg: string) =>
  z.string().refine((v) => parseDate(v) != null, msg).transform((v) => parseDate(v)!);

export const pilgrimSchema = z.object({
  firstName: z.string().trim().min(1, "الاسم الأول مطلوب"),
  fatherName: z.string().trim().min(1, "اسم الأب مطلوب"),
  grandfatherName: z.string().trim().min(1, "اسم الجد مطلوب"),
  greatGrandfatherName: opt,
  familyName: z.string().trim().min(1, "اللقب مطلوب"),
  gender: z.enum(["MALE", "FEMALE"], { message: "الجنس مطلوب" }),
  birthDate: dateField("تاريخ الميلاد غير صحيح (DD/MM/YYYY)"),
  motherName: opt,
  governorate: opt,
  address: opt,
  phone: opt.refine((v) => !v || isIraqiMobile(v), "رقم الهاتف يجب أن يكون بصيغة 07XXXXXXXXX").transform((v) => (v ? normalizePhone(v) : undefined)),
  emergencyPhone: opt.refine((v) => !v || isEmergencyPhone(v), "رقم الطوارئ غير صحيح").transform((v) => (v ? normalizePhone(v) : undefined)),
  passportNo: z.string().trim().min(5, "رقم الجواز مطلوب").transform(normalizePassportNo),
  enGivenName: z.string().trim().min(1, "الاسم الأول بالإنكليزية مطلوب").transform((v) => v.toUpperCase()),
  enFatherName: opt.transform((v) => v?.toUpperCase()),
  enGrandfatherName: opt.transform((v) => v?.toUpperCase()),
  enSurname: z.string().trim().min(1, "اللقب بالإنكليزية مطلوب").transform((v) => v.toUpperCase()),
  nationality: z.string().trim().default("IRAQI"),
  placeOfBirth: opt,
  passportIssue: z.string().optional().transform((v) => (v ? parseDate(v) ?? undefined : undefined)),
  passportExpiry: dateField("تاريخ انتهاء الجواز غير صحيح (DD/MM/YYYY)"),
  passportAuthority: opt,
  mahramId: opt,
  mahramRelation: opt,
  chronicIllness: z.boolean().default(false),
  wheelchair: z.boolean().default(false),
  elderly: z.boolean().default(false),
  healthNotes: opt,
  agentId: opt,
});
export type PilgrimInput = z.infer<typeof pilgrimSchema>;

export const DUPLICATE_PASSPORT_MSG = "رقم الجواز مسجّل مسبقاً لمعتمر آخر";

export async function findByPassport(passportNo: string, excludeId?: string) {
  return db.pilgrim.findFirst({ where: { passportNo, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
}

export function formToObject(form: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") o[k] = v;
  for (const b of ["chronicIllness", "wheelchair", "elderly"]) o[b] = form.get(b) === "on";
  return o;
}

export type ActionState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; id?: string };

export function zodToState(e: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { error: "تحقّق من الحقول المظللة", fieldErrors };
}

export async function createPilgrim(user: SessionUser, data: PilgrimInput): Promise<ActionState> {
  if (await findByPassport(data.passportNo)) return { error: DUPLICATE_PASSPORT_MSG, fieldErrors: { passportNo: DUPLICATE_PASSPORT_MSG } };
  try {
    const p = await db.pilgrim.create({ data: data as Prisma.PilgrimUncheckedCreateInput });
    return { ok: true, id: p.id };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: DUPLICATE_PASSPORT_MSG, fieldErrors: { passportNo: DUPLICATE_PASSPORT_MSG } };
    throw e;
  }
}

export async function updatePilgrim(user: SessionUser, id: string, data: PilgrimInput): Promise<ActionState> {
  if (await findByPassport(data.passportNo, id)) return { error: DUPLICATE_PASSPORT_MSG, fieldErrors: { passportNo: DUPLICATE_PASSPORT_MSG } };
  await db.$transaction(async (tx) => {
    const before = await tx.pilgrim.findUniqueOrThrow({ where: { id } });
    const after = await tx.pilgrim.update({ where: { id }, data: data as Prisma.PilgrimUncheckedUpdateInput });
    await auditChanges(tx, user, "Pilgrim", id, before, after, PILGRIM_AUDITED);
  });
  return { ok: true, id };
}

export function fullNameAr(p: { firstName: string; fatherName: string; grandfatherName: string; familyName: string }) {
  return `${p.firstName} ${p.fatherName} ${p.grandfatherName} ${p.familyName}`;
}
export function fullNameEn(p: { enGivenName: string; enFatherName?: string | null; enGrandfatherName?: string | null; enSurname: string }) {
  return [p.enGivenName, p.enFatherName, p.enGrandfatherName, p.enSurname].filter(Boolean).join(" ");
}
