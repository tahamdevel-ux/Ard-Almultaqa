"use server";
import { revalidatePath } from "next/cache";
import { AuthError, requirePermission } from "@/server/auth";
import { addFamilyPayment } from "@/server/payments";
import { parseDate } from "@/domain/dates";
import type { FormState } from "@/app/(app)/bookings/[id]/actions";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;

export async function payFamily(groupId: string, _p: FormState, f: FormData): Promise<FormState> {
  try {
    const u = await requirePermission("payments.write");
    const paidAt = parseDate(s(f, "paidAt"));
    if (!paidAt) return { error: "تاريخ الدفعة غير صحيح (DD/MM/YYYY)" };
    const r = await addFamilyPayment(u, groupId, {
      amount: Number(s(f, "amount").replace(/,/g, "")), currency: s(f, "currency") === "IQD" ? "IQD" : "USD",
      rate: s(f, "rate") ? Number(s(f, "rate")) : null, method: METHODS.find((m) => m === s(f, "method")) ?? "CASH", paidAt, note: s(f, "note") });
    revalidatePath(`/families/${groupId}`);
    return r.ok ? { ok: true, receiptNo: r.receiptNo } : { error: r.error };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
