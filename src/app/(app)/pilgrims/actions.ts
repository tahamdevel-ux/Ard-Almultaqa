"use server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";
import { createPilgrim, formToObject, pilgrimSchema, updatePilgrim, zodToState, type ActionState } from "@/server/pilgrims";
import { deleteFile, putFile } from "@/server/storage";

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
    const r = id ? await updatePilgrim(user, id, data as never) : await createPilgrim(user, data as never);
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
