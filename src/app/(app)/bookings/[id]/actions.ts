"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { addPayment, cancelBooking, moveToTrip, setBookingPrice } from "@/server/payments";
import { parseDate } from "@/domain/dates";

export type FormState = { error?: string; ok?: boolean; receiptNo?: number };
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const touch = (id: string) => revalidatePath(`/bookings/${id}`);
const METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;

async function guard(perm: Parameters<typeof requirePermission>[0], fn: (u: Awaited<ReturnType<typeof requirePermission>>) => Promise<FormState>): Promise<FormState> {
  try { return await fn(await requirePermission(perm)); } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function savePrice(bookingId: string, _p: FormState, f: FormData): Promise<FormState> {
  return guard("prices.write", async (u) => {
    const amountRaw = s(f, "amount");
    const r = await setBookingPrice(u, bookingId, {
      roomType: s(f, "roomType") || null, amount: amountRaw === "" ? null : Number(amountRaw), currency: s(f, "currency") === "IQD" ? "IQD" : "USD" });
    touch(bookingId);
    return r.ok ? { ok: true } : { error: r.error };
  });
}

export async function recordPayment(bookingId: string, kind: "PAYMENT" | "REFUND", _p: FormState, f: FormData): Promise<FormState> {
  return guard("payments.write", async (u) => {
    const paidAt = parseDate(s(f, "paidAt"));
    if (!paidAt) return { error: "تاريخ الدفعة غير صحيح (DD/MM/YYYY)" };
    const method = METHODS.find((m) => m === s(f, "method")) ?? "CASH";
    const r = await addPayment(u, bookingId, {
      kind, amount: Number(s(f, "amount").replace(/,/g, "")), currency: s(f, "currency") === "IQD" ? "IQD" : "USD",
      rate: s(f, "rate") ? Number(s(f, "rate")) : null, method, paidAt, note: s(f, "note"), reason: s(f, "reason") });
    touch(bookingId);
    return r.ok ? { ok: true, receiptNo: r.receiptNo } : { error: r.error };
  });
}

export async function cancel(bookingId: string, _p: FormState, f: FormData): Promise<FormState> {
  return guard("payments.write", async (u) => {
    const paidAt = parseDate(s(f, "paidAt")) ?? new Date();
    const amount = s(f, "refundAmount") ? Number(s(f, "refundAmount")) : 0;
    const r = await cancelBooking(u, bookingId, s(f, "reason"), amount > 0 ? {
      amount, currency: s(f, "currency") === "IQD" ? "IQD" : "USD", rate: s(f, "rate") ? Number(s(f, "rate")) : null,
      method: METHODS.find((m) => m === s(f, "method")) ?? "CASH", paidAt } : undefined);
    touch(bookingId);
    return r.ok ? { ok: true } : { error: r.error };
  });
}

export async function move(bookingId: string, _p: FormState, f: FormData): Promise<FormState> {
  const u = await requirePermission("bookings.write").catch((e) => { if (e instanceof AuthError) return null; throw e; });
  if (!u) return { error: "ليست لديك صلاحية" };
  const r = await moveToTrip(u, bookingId, s(f, "tripId"));
  if (!r.ok) return { error: r.error };
  redirect(`/bookings/${r.id}`);
}

export async function saveTripPrices(tripId: string, f: FormData) {
  await requirePermission("prices.write");
  for (const t of ["DOUBLE", "TRIPLE", "QUAD", "QUINT"] as const) {
    const v = s(f, t);
    if (v === "") await db.tripPrice.deleteMany({ where: { tripId, roomType: t } });
    else if (Number(v) >= 0) await db.tripPrice.upsert({ where: { tripId_roomType: { tripId, roomType: t } }, create: { tripId, roomType: t, currency: "USD", amount: Math.round(Number(v)) }, update: { amount: Math.round(Number(v)), currency: "USD" } });
  }
  revalidatePath(`/trips/${tripId}`);
}
