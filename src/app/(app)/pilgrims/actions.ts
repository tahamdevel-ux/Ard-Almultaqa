"use server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";
import { createPilgrimWithTrips, formToObject, pilgrimSchema, updatePilgrim, zodToState, type ActionState } from "@/server/pilgrims";
import { deleteFile, putFile } from "@/server/storage";
import { splitTripleName } from "@/import/values";
import { accommodationForTrip, applyAccommodation, AccommodationError } from "@/server/accommodation";
import { addPilgrimToTrips, overlapWarnings, summarizeAdd } from "@/server/bookings";

const HEALTH = ["chronicIllness", "wheelchair", "elderly", "healthNotes"];
const MAX_UPLOAD = 12 * 1024 * 1024;

async function guard<T>(fn: () => Promise<T>): Promise<T | ActionState> {
  try { return await fn(); } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function savePilgrim(id: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requirePermission("pilgrims.write");
    const raw = formToObject(form);
    // one "triple name" box -> first / father / grandfather
    if (typeof raw.fullNameAr === "string") {
      const n = splitTripleName(raw.fullNameAr);
      if (!n.first || !n.father) return { error: "تحقّق من الحقول المظللة", fieldErrors: { fullNameAr: "اكتب الاسم الأول واسم الأب على الأقل" } };
      raw.firstName = n.first; raw.fatherName = n.father; raw.grandfatherName = n.grandfather;
      delete raw.fullNameAr;
    }
    const canHealth = can(user.role, "pilgrims.health");
    if (!canHealth) for (const k of HEALTH) delete raw[k];
    const parsed = pilgrimSchema.safeParse(raw);
    if (!parsed.success) return zodToState(parsed.error);
    const data = { ...parsed.data } as Record<string, unknown>;
    const mp = String(raw.mahramPassport ?? "").replace(/\s+/g, "").toUpperCase();
    if (mp) {
      const m = await db.pilgrim.findFirst({ where: { passportNo: mp, deletedAt: null } });
      if (!m) return { error: "المحرم غير مسجّل", fieldErrors: { mahramPassport: "لا يوجد معتمر بهذا رقم الجواز" } };
      if (id && m.id === id) return { error: "لا يمكن ربط المعتمر بنفسه", fieldErrors: { mahramPassport: "لا يمكن ربط المعتمر بنفسه" } };
      data.mahramId = m.id;
    } else data.mahramId = null;
    if (!canHealth) for (const k of HEALTH) delete data[k];
    let r: ActionState;
    if (id) r = await updatePilgrim(user, id, data as never);
    else {
      await requirePermission("bookings.write");
      const tripIds = form.getAll("tripIds").map(String).filter(Boolean);
      r = await createPilgrimWithTrips(user, data as never, tripIds, Object.fromEntries(tripIds.map((t) => [t, accommodationForTrip(form, t)])));
    }
    if (r.ok) revalidatePath("/pilgrims");
    return r;
  }) as Promise<ActionState>;
}

export async function uploadDocument(pilgrimId: string, type: "PASSPORT" | "PHOTO" | "NATIONAL_ID" | "OTHER", _p: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requirePermission("documents.write");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "اختر ملفاً" };
    if (file.size > MAX_UPLOAD) return { error: "حجم الملف أكبر من 12 ميغابايت" };
    const buf = Buffer.from(await file.arrayBuffer());
    let out: Buffer, ext: string, mime: string;
    if (file.type === "application/pdf") { out = buf; ext = "pdf"; mime = file.type; }
    else if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) {
      try {
        out = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      } catch { return { error: "تعذّر قراءة الصورة" }; }
      ext = "jpg"; mime = "image/jpeg";
    } else return { error: "الملفات المسموحة: صورة أو PDF" };
    const key = await putFile(out, ext);
    // one passport scan / photo per pilgrim: replace the previous one
    if (type === "PASSPORT" || type === "PHOTO") {
      const old = await db.pilgrimDocument.findMany({ where: { pilgrimId, type } });
      for (const o of old) { await deleteFile(o.storageKey); await db.pilgrimDocument.delete({ where: { id: o.id } }); }
    }
    await db.pilgrimDocument.create({ data: { pilgrimId, type, storageKey: key, mime, size: out.length } });
    revalidatePath(`/pilgrims/${pilgrimId}`);
    return { ok: true };
  }) as Promise<ActionState>;
}

export async function removeDocument(docId: string): Promise<void> {
  await requirePermission("documents.write");
  const d = await db.pilgrimDocument.findUnique({ where: { id: docId } });
  if (!d) return;
  await deleteFile(d.storageKey);
  await db.pilgrimDocument.delete({ where: { id: docId } });
  revalidatePath(`/pilgrims/${d.pilgrimId}`);
}

/** Pilgrim profile: add him to one or more trips at once (overlaps allowed, duplicates skipped). */
export async function addToTrips(pilgrimId: string, _p: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requirePermission("bookings.write");
    const tripIds = form.getAll("tripIds").map(String).filter(Boolean);
    if (!tripIds.length) return { error: "اختر رحلة واحدة على الأقل" };
    const p = await db.pilgrim.findFirst({ where: { id: pilgrimId, deletedAt: null } });
    if (!p) return { error: "المعتمر غير موجود" };
    let r;
    try {
      r = await db.$transaction(async (tx) => {
        const res = await addPilgrimToTrips(tx, pilgrimId, p.agentId, tripIds);
        for (const tripId of res.added) {
          const a = accommodationForTrip(form, tripId);
          if (!a) continue;
          const booking = await tx.booking.findUniqueOrThrow({ where: { pilgrimId_tripId: { pilgrimId, tripId } } });
          const ar = await applyAccommodation(tripId, booking.id, a, tx);
          if (!ar.ok) throw new AccommodationError(ar.error);
        }
        return res;
      });
    } catch (e) {
      if (e instanceof AccommodationError) return { error: e.message };
      throw e;
    }
    const warnings = await overlapWarnings(pilgrimId, r.added);
    revalidatePath(`/pilgrims/${pilgrimId}`);
    for (const id of r.added) revalidatePath(`/trips/${id}`, "layout");
    return { ok: true, message: [summarizeAdd(r), ...warnings.map((w) => `⚠ ${w}`)].join(" — ") };
  }) as Promise<ActionState>;
}
