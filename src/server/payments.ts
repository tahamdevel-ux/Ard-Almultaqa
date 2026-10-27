import type { Currency, PaymentKind, PaymentMethod, Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { auditChanges } from "./audit";
import { checkPayment, paidTotal } from "@/domain/money";

type Tx = Prisma.TransactionClient;
export type Result = { ok: true; id?: string; receiptNo?: number } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const BOOKING_PRICE_FIELDS = ["roomType", "priceAmount", "priceCurrency"] as const;

export async function defaultPrice(tripId: string, roomType: string | null) {
  if (!roomType) return null;
  return db.tripPrice.findUnique({ where: { tripId_roomType: { tripId, roomType: roomType as never } } });
}

/** Sets room type + price on a booking. Omitted amount => use the trip's default price for the room type. */
export async function setBookingPrice(
  user: SessionUser, bookingId: string,
  input: { roomType: string | null; amount: number | null; currency: Currency },
): Promise<Result> {
  if (input.amount != null && (!Number.isInteger(input.amount) || input.amount < 0)) return fail("السعر غير صحيح");
  return db.$transaction(async (tx) => {
    const before = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
    let { amount, currency } = input;
    if (amount == null) {
      const d = await tx.tripPrice.findFirst({ where: { tripId: before.tripId, roomType: (input.roomType ?? undefined) as never } });
      if (d) { amount = d.amount; currency = d.currency; }
    }
    if (before.payments.length && currency !== before.priceCurrency) return fail("لا يمكن تغيير عملة حجز عليه دفعات");
    const after = await tx.booking.update({ where: { id: bookingId }, data: { roomType: input.roomType, priceAmount: amount, priceCurrency: currency } });
    await auditChanges(tx, user, "Booking", bookingId, before, after, BOOKING_PRICE_FIELDS);
    return { ok: true } as Result;
  });
}

export async function addPayment(
  user: SessionUser, bookingId: string,
  input: { kind: PaymentKind; amount: number; currency: Currency; rate?: number | null; method: PaymentMethod; paidAt: Date; note?: string; reason?: string },
): Promise<Result> {
  return db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { payments: true } });
    if (!b) return fail("الحجز غير موجود");
    if (b.status !== "ACTIVE" && input.kind === "PAYMENT") return fail("لا يمكن استلام دفعة على حجز ملغى أو منقول");
    if (b.priceAmount == null && input.kind === "PAYMENT") return fail("حدّد سعر الحجز أولاً");
    const chk = checkPayment({ ...input }, b.priceCurrency, b.payments.map((x) => ({ kind: x.kind, credited: Number(x.credited) })));
    if ("error" in chk) return fail(chk.error);
    if (input.kind === "PAYMENT" && b.priceAmount != null && chk.credited > b.priceAmount - paidTotal(b.payments.map((x) => ({ kind: x.kind, credited: Number(x.credited) }))) + 0.01)
      return fail("المبلغ أكبر من المتبقي على الحجز");
    const p = await tx.payment.create({ data: {
      bookingId, kind: input.kind, amount: input.amount, currency: input.currency, exchangeRate: input.currency === b.priceCurrency ? null : input.rate ?? null,
      credited: chk.credited, method: input.method, paidAt: input.paidAt,
      note: input.note || null, reason: input.reason || null, receivedById: user.id, receivedByName: user.name } });
    await auditChanges(tx, user, "Payment", p.id, {}, { kind: p.kind, amount: p.amount, currency: p.currency, receiptNo: p.receiptNo, bookingId, exchangeRate: p.exchangeRate, credited: p.credited.toString() }, ["kind", "amount", "currency", "receiptNo", "bookingId", "exchangeRate", "credited"]);
    return { ok: true, id: p.id, receiptNo: p.receiptNo } as Result;
  });
}

async function clearAssignments(tx: Tx, bookingId: string) {
  await tx.seatAssignment.deleteMany({ where: { bookingId } });
  await tx.roomAssignment.deleteMany({ where: { bookingId } });
}

/** Cancels the booking, frees seat/rooms and optionally records a refund (kept money = paid - refund). */
export async function cancelBooking(
  user: SessionUser, bookingId: string, reason: string,
  refund?: { amount: number; currency?: Currency; rate?: number | null; method: PaymentMethod; paidAt: Date },
): Promise<Result> {
  if (!reason.trim()) return fail("سبب الإلغاء مطلوب");
  const b = await db.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== "ACTIVE") return fail("الحجز غير فعّال");
  if (refund && refund.amount > 0) {
    const r = await addPayment(user, bookingId, { kind: "REFUND", amount: refund.amount, currency: refund.currency ?? b.priceCurrency, rate: refund.rate, method: refund.method, paidAt: refund.paidAt, reason });
    if (!r.ok) return r;
  }
  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelReason: reason.trim(), cancelledAt: new Date() } });
    await auditChanges(tx, user, "Booking", bookingId, { status: "ACTIVE" }, { status: "CANCELLED" }, ["status"]);
    await clearAssignments(tx, bookingId);
  });
  return { ok: true };
}

/** Moves a pilgrim to another trip keeping price, history (old booking = MOVED) and payments (re-pointed). */
export async function moveToTrip(user: SessionUser, bookingId: string, targetTripId: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const old = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!old || old.status !== "ACTIVE") return fail("الحجز غير فعّال");
    if (old.tripId === targetTripId) return fail("الرحلة نفسها");
    const target = await tx.trip.findFirst({ where: { id: targetTripId, deletedAt: null } });
    if (!target) return fail("الرحلة الهدف غير موجودة");
    const existing = await tx.booking.findUnique({ where: { pilgrimId_tripId: { pilgrimId: old.pilgrimId, tripId: targetTripId } } });
    if (existing?.status === "ACTIVE") return fail("المعتمر محجوز مسبقاً في الرحلة الهدف");
    const data = { agentId: old.agentId, roomType: old.roomType, priceAmount: old.priceAmount, priceCurrency: old.priceCurrency, movedFromId: old.id, visaStatus: old.visaStatus, visaNo: old.visaNo, visaIssue: old.visaIssue, visaExpiry: old.visaExpiry };
    const nb = existing
      ? await tx.booking.update({ where: { id: existing.id }, data: { ...data, status: "ACTIVE", deletedAt: null, cancelReason: null, cancelledAt: null } })
      : await tx.booking.create({ data: { pilgrimId: old.pilgrimId, tripId: targetTripId, ...data } });
    await tx.payment.updateMany({ where: { bookingId: old.id }, data: { bookingId: nb.id } });
    await tx.booking.update({ where: { id: old.id }, data: { status: "MOVED" } });
    await clearAssignments(tx, old.id);
    await auditChanges(tx, user, "Booking", old.id, { tripId: old.tripId }, { tripId: targetTripId }, ["tripId"]);
    return { ok: true, id: nb.id } as Result;
  });
}
