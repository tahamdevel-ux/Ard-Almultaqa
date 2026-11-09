"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";
import { createPilgrimWithTrips, formEcho, formToObject, fullNameAr, pilgrimSchema, updatePilgrim, zodToState, type ActionState } from "@/server/pilgrims";
import { splitTripleName } from "@/import/values";
import { accommodationForTrip, applyAccommodation, AccommodationError } from "@/server/accommodation";
import { addPilgrimToTrips, overlapWarnings, summarizeAdd } from "@/server/bookings";

const HEALTH = ["chronicIllness", "wheelchair", "elderly", "healthNotes"];

async function guard<T>(fn: () => Promise<T>): Promise<T | ActionState> {
  try { return await fn(); } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function savePilgrim(id: string | null, prev: ActionState, form: FormData): Promise<ActionState> {
  const r = await savePilgrimInner(id, prev, form);
  const intent = form.get("intent") === "saveNew" ? "saveNew" as const : "save" as const;
  const values = formEcho(form);
  if (!r.ok) return { ...r, values };
  const p = r.id ? await db.pilgrim.findUnique({ where: { id: r.id } }) : null;
  return { ...r, intent, values: { tripIds: values.tripIds ?? [], agentId: values.agentId ?? "" }, name: p ? fullNameAr(p) : undefined };
}

async function savePilgrimInner(id: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
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
