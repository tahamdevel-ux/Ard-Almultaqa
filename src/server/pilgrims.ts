import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { auditChanges, PILGRIM_AUDITED } from "./audit";
import { normalizePassport, normalizePhone, validatePassport, validatePhone } from "@/domain/identity";
import { parseDate } from "@/domain/dates";
import { addPilgrimToTrips } from "./bookings";
import { applyAccommodation, AccommodationError, type Accommodation } from "./accommodation";
import { applyFamilyChoice, type FamilyChoice } from "./families";

const opt = z.string().trim().optional().transform((v) => (v ? v : undefined));
const dateField = (msg: string) =>
  z.string().refine((v) => parseDate(v) != null, msg).transform((v) => parseDate(v)!);

export const pilgrimSchema = z.object({
  firstName: z.string().trim().min(1, "الاسم الأول مطلوب"),
  fatherName: z.string().trim().min(1, "اسم الأب مطلوب"),
  grandfatherName: z.string().trim().optional().transform((v) => v ?? ""), // optional: a two-word name is accepted
  greatGrandfatherName: opt,
  familyName: z.string().trim().optional().transform((v) => v ?? ""), // Arabic surname is optional
  gender: z.enum(["MALE", "FEMALE"], { message: "الجنس مطلوب" }),
  birthDate: dateField("تاريخ الميلاد غير صحيح (DD/MM/YYYY)"),
  motherName: z.string().trim().min(1, "اسم الأم مطلوب"),
  address: opt,
  phone: opt.transform((v) => (v ? normalizePhone(v) : undefined)),
  emergencyPhone: opt.transform((v) => (v ? normalizePhone(v) : undefined)),
  passportType: z.enum(["IRAQI", "FOREIGN"]).default("IRAQI"),
  passportNo: z.string().trim().min(1, "رقم الجواز مطلوب").transform(normalizePassport),
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
}).superRefine((d, ctx) => {
  const pe = d.passportNo ? validatePassport(d.passportNo, d.passportType) : null;
  if (pe) ctx.addIssue({ code: "custom", path: ["passportNo"], message: pe });
  for (const k of ["phone", "emergencyPhone"] as const) {
    const v = d[k];
    const e = v ? validatePhone(v) : null;
    if (e) ctx.addIssue({ code: "custom", path: [k], message: e });
  }
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

export type ActionState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; id?: string; message?: string; bookingIds?: Record<string, string>; name?: string; intent?: "save" | "saveNew" | "saveFamily"; values?: Record<string, string | string[]> };

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
    if ((before.agentId ?? null) !== (after.agentId ?? null)) {
      // the agent changed: his active bookings follow, so the agent commission moves to the new agent (rooms only show a warning)
      await tx.booking.updateMany({ where: { pilgrimId: id, status: "ACTIVE", deletedAt: null }, data: { agentId: after.agentId } });
    }
    await auditChanges(tx, user, "Pilgrim", id, before, after, PILGRIM_AUDITED);
  });
  return { ok: true, id };
}

export function fullNameAr(p: { firstName: string; fatherName: string; grandfatherName: string; familyName: string }) {
  return [p.firstName, p.fatherName, p.grandfatherName, p.familyName].filter(Boolean).join(" ");
}
/** Triple name only (first, father, grandfather): what the rooming lists and boards show. */
export function tripleNameAr(p: { firstName: string; fatherName: string; grandfatherName: string }) {
  return [p.firstName, p.fatherName, p.grandfatherName].filter(Boolean).join(" ");
}
export function fullNameEn(p: { enGivenName: string; enFatherName?: string | null; enGrandfatherName?: string | null; enSurname: string }) {
  return [p.enGivenName, p.enFatherName, p.enGrandfatherName, p.enSurname].filter(Boolean).join(" ");
}

/** New pilgrim + bookings in one transaction: either everything is saved or nothing. */
export async function createPilgrimWithTrips(user: SessionUser, data: PilgrimInput, tripIds: string[], acc: Record<string, Accommodation | undefined> = {}, fam: Record<string, FamilyChoice | undefined> = {}): Promise<ActionState> {
  if (tripIds.length === 0) return { error: "اختر رحلة واحدة على الأقل", fieldErrors: { tripIds: "اختر رحلة واحدة على الأقل" } };
  if (await findByPassport(data.passportNo)) return { error: DUPLICATE_PASSPORT_MSG, fieldErrors: { passportNo: DUPLICATE_PASSPORT_MSG } };
  try {
    return await db.$transaction(async (tx) => {
      const live = await tx.trip.count({ where: { id: { in: tripIds }, deletedAt: null } });
      if (live !== new Set(tripIds).size) return { error: "إحدى الرحلات المختارة غير موجودة", fieldErrors: { tripIds: "إحدى الرحلات المختارة غير موجودة" } } as ActionState;
      const p = await tx.pilgrim.create({ data: data as Prisma.PilgrimUncheckedCreateInput });
      await addPilgrimToTrips(tx, p.id, p.agentId, tripIds, { skipOfficeTrips: tripIds.filter((t) => acc[t]?.officeRoom) });
      const bookingIds: Record<string, string> = {};
      for (const tripId of tripIds) {
        const booking = await tx.booking.findUniqueOrThrow({ where: { pilgrimId_tripId: { pilgrimId: p.id, tripId } } });
        bookingIds[tripId] = booking.id;
        const a = acc[tripId];
        if (a) {
          const r = await applyAccommodation(tripId, booking.id, a, tx);
          if (!r.ok) throw new AccommodationError(r.error); // rolls back the pilgrim and every booking
        }
        const f = fam[tripId];
        if (f) { const err = await applyFamilyChoice(tx, tripId, booking.id, f); if (err) throw new AccommodationError(err); }
      }
      return { ok: true, id: p.id, bookingIds } as ActionState;
    });
  } catch (e) {
    if (e instanceof AccommodationError) return { error: e.message, fieldErrors: { tripIds: e.message } };
    if ((e as { code?: string }).code === "P2002") return { error: DUPLICATE_PASSPORT_MSG, fieldErrors: { passportNo: DUPLICATE_PASSPORT_MSG } };
    throw e;
  }
}

/** What the user typed, so a failed save keeps every field (React clears uncontrolled forms after an action). */
export function formEcho(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const k of new Set(form.keys())) {
    const all = form.getAll(k).filter((x): x is string => typeof x === "string");
    if (!all.length) continue;
    out[k] = k === "tripIds" || all.length > 1 ? all : all[0];
  }
  return out;
}
