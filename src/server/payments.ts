import type { Currency, PaymentKind, PaymentMethod, PaymentSource, Prisma } from "@prisma/client";
import { db, type DbTx } from "./db";
import type { SessionUser } from "./auth";
import { auditChanges } from "./audit";
import { assignOfficeRooms, freeOfficeBeds } from "@/officeRooms/service";
import { balance, checkPayment, floorCents, isMoney, paidTotal, round2 } from "@/domain/money";
import { computePrice, type RoomKind } from "@/domain/pricing";

type Tx = DbTx;
export type Result = { ok: true; id?: string; receiptNo?: number } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

/** Archived trips are view/print only: payments and refunds can still be recorded (debts get settled late), but the booking's price, cancellation and moves are frozen. */
export const ARCHIVED_MSG = "هذه رحلة مؤرشفة: للعرض والطباعة فقط (يمكن تسجيل الدفعات والاسترداد)";
const isArchivedTrip = async (tx: Tx, tripId: string) => !!(await tx.trip.findUnique({ where: { id: tripId }, select: { archivedAt: true } }))?.archivedAt;

/** Thrown inside a transaction to roll everything back and hand the failure to the caller. */
class Abort extends Error { constructor(readonly result: Result) { super("abort"); } }
async function atomic(fn: (tx: Tx) => Promise<Result>): Promise<Result> {
  try { return await db.$transaction(fn); } catch (e) { if (e instanceof Abort) return e.result; throw e; }
}
/** Serialises money changes on one booking: a second payment waits until the first commits, then re-reads the balance. */
const lockBooking = (tx: Tx, bookingId: string) => tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
const creditsOf = (payments: { kind: PaymentKind; credited: unknown }[]) => payments.map((x) => ({ kind: x.kind, credited: Number(x.credited) }));

const BOOKING_PRICE_FIELDS = ["roomType", "priceAmount", "priceCurrency", "priceManual", "sarfAmount"] as const;

/** Sets room type + price on a booking. Bookings are always priced in USD. Omitted amount => use the hotel table price. */
export async function setBookingPrice(
  user: SessionUser, bookingId: string,
  input: { roomType: string | null; amount: number | null },
): Promise<Result> {
  if (input.amount != null && (!isMoney(input.amount) || input.amount < 0)) return fail("السعر غير صحيح (حتى خانتين عشريتين)");
  return db.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const before = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
    if (await isArchivedTrip(tx, before.tripId)) return fail(ARCHIVED_MSG);
    let amount = input.amount;
    let sarf: number | null = null; // the تصريف inside a table-computed price (kept on the booking like repriceBooking does)
    let manual = true;
    if (amount == null) {
      // empty = back to the table: the booking's Makkah hotel (room type price or بدون سكن, + تصريف المعتمر)
      manual = false;
      const trip = await tx.trip.findUniqueOrThrow({ where: { id: before.tripId } });
      const th = before.tripHotelId ? await tx.tripHotel.findUnique({ where: { id: before.tripHotelId }, include: { prices: true } }) : null;
      const rt = (input.roomType ?? before.roomType ?? null) as RoomKind | null;
      if (th) {
        const r = computePrice({ table: { prices: Object.fromEntries(th.prices.map((p) => [p.roomType, p.amount])), noHousingPrice: th.noHousingPrice }, roomType: rt, noHousing: before.noHousing, sarfByPilgrim: before.sarfByPilgrim, sarfAmount: trip.sarfAmount });
        if (r.ok) { amount = r.amount; sarf = r.sarf; } else return fail(r.error);
      } else return fail("اختر فندق مكة المسعّر للمعتمر أو اكتب السعر يدوياً");
    }
    const paid = paidTotal(creditsOf(before.payments));
    if (amount != null && before.status === "ACTIVE" && amount < paid - 0.005) return fail(`السعر أقل من المدفوع (${paid}) — سجّل استرداداً أولاً`);
    const after = await tx.booking.update({ where: { id: bookingId }, data: { roomType: input.roomType, priceAmount: amount, priceCurrency: "USD", priceManual: manual && amount != null, ...(sarf != null ? { sarfAmount: sarf } : {}) } });
    await auditChanges(tx, user, "Booking", bookingId, before, after, BOOKING_PRICE_FIELDS);
    return { ok: true } as Result;
  });
}

export type PaymentInput = { kind: PaymentKind; amount: number; currency: Currency; rate?: number | null; method: PaymentMethod; paidAt: Date; note?: string; reason?: string; source?: PaymentSource; sourceAgentId?: string | null };

/** Records one payment/refund inside the caller's transaction (booking row locked, so concurrent payments cannot overpay). */
export async function addPaymentTx(tx: Tx, user: SessionUser, bookingId: string, input: PaymentInput): Promise<Result> {
  const source: PaymentSource = input.kind === "PAYMENT" ? input.source ?? "DIRECT" : "DIRECT";
  if (source === "AGENT" && !input.sourceAgentId) return fail("اختر الوكيل الذي دفع عن طريقه");
  if (source === "AGENT" && !(await tx.agent.findFirst({ where: { id: input.sourceAgentId!, deletedAt: null } }))) return fail("الوكيل غير موجود");
  await lockBooking(tx, bookingId);
  const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { payments: true } });
  if (!b) return fail("الحجز غير موجود");
  if (b.status !== "ACTIVE" && input.kind === "PAYMENT") return fail("لا يمكن استلام دفعة على حجز ملغى أو منقول");
  if (b.priceAmount == null && input.kind === "PAYMENT") return fail("حدّد سعر الحجز أولاً");
  const existing = creditsOf(b.payments);
  const chk = checkPayment({ ...input }, b.priceCurrency, existing);
  if ("error" in chk) return fail(chk.error);
  if (input.kind === "PAYMENT" && b.priceAmount != null && chk.credited > b.priceAmount - paidTotal(existing) + 0.005) // amounts are in cents: no slack beyond float noise
    return fail("المبلغ أكبر من المتبقي على الحجز");
  const p = await tx.payment.create({ data: {
    bookingId, kind: input.kind, amount: input.amount, currency: input.currency, exchangeRate: input.currency === b.priceCurrency ? null : input.rate ?? null,
    credited: chk.credited, method: input.method, paidAt: input.paidAt, tripId: b.tripId, bookingPrice: b.priceAmount,
    note: input.note || null, reason: input.reason || null, source, sourceAgentId: source === "AGENT" ? input.sourceAgentId : null, receivedById: user.id, receivedByName: user.name } });
  await auditChanges(tx, user, "Payment", p.id, {}, { kind: p.kind, amount: p.amount, currency: p.currency, receiptNo: p.receiptNo, bookingId, exchangeRate: p.exchangeRate, credited: p.credited.toString(), source: p.source, sourceAgentId: p.sourceAgentId }, ["kind", "amount", "currency", "receiptNo", "bookingId", "exchangeRate", "credited", "source", "sourceAgentId"]);
  return { ok: true, id: p.id, receiptNo: p.receiptNo };
}

export async function addPayment(user: SessionUser, bookingId: string, input: PaymentInput): Promise<Result> {
  return db.$transaction((tx) => addPaymentTx(tx, user, bookingId, input));
}

async function clearAssignments(tx: Tx, bookingId: string) {
  await tx.seatAssignment.deleteMany({ where: { bookingId } });
  await tx.roomAssignment.deleteMany({ where: { bookingId } });
}

/** Cancels the booking, frees seat/rooms and optionally records a refund (kept money = paid - refund). Refund + cancel are one transaction. */
export async function cancelBooking(
  user: SessionUser, bookingId: string, reason: string,
  refund?: { amount: number; currency?: Currency; rate?: number | null; method: PaymentMethod; paidAt: Date },
): Promise<Result> {
  if (!reason.trim()) return fail("سبب الإلغاء مطلوب");
  return atomic(async (tx) => {
    await lockBooking(tx, bookingId);
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.status !== "ACTIVE") return fail("الحجز غير فعّال");
    if (await isArchivedTrip(tx, b.tripId)) return fail(ARCHIVED_MSG);
    if (refund && refund.amount > 0) {
      const r = await addPaymentTx(tx, user, bookingId, { kind: "REFUND", amount: refund.amount, currency: refund.currency ?? b.priceCurrency, rate: refund.rate, method: refund.method, paidAt: refund.paidAt, reason });
      if (!r.ok) throw new Abort(r);
    }
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelReason: reason.trim(), cancelledAt: new Date() } });
    await auditChanges(tx, user, "Booking", bookingId, { status: "ACTIVE" }, { status: "CANCELLED" }, ["status"]);
    await clearAssignments(tx, bookingId);
    await freeOfficeBeds(tx, [bookingId]); // the bed is freed, the room keeps its number
    return { ok: true };
  });
}

/** Moves a pilgrim to another trip keeping price, history (old booking = MOVED) and payments (re-pointed). */
export async function moveToTrip(user: SessionUser, bookingId: string, targetTripId: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    await lockBooking(tx, bookingId); // a payment recorded while we move must wait, otherwise it would stay on the old (MOVED) booking
    const old = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!old || old.status !== "ACTIVE") return fail("الحجز غير فعّال");
    if (old.tripId === targetTripId) return fail("الرحلة نفسها");
    if (await isArchivedTrip(tx, old.tripId)) return fail(ARCHIVED_MSG);
    const target = await tx.trip.findFirst({ where: { id: targetTripId, deletedAt: null } });
    if (!target) return fail("الرحلة الهدف غير موجودة");
    if (target.archivedAt) return fail("الرحلة الهدف مؤرشفة: لا تقبل معتمرين جدداً");
    const existing = await tx.booking.findUnique({ where: { pilgrimId_tripId: { pilgrimId: old.pilgrimId, tripId: targetTripId } } });
    if (existing?.status === "ACTIVE") return fail("المعتمر محجوز مسبقاً في الرحلة الهدف");
    const data = { agentId: old.agentId, roomType: old.roomType, priceAmount: old.priceAmount, priceCurrency: old.priceCurrency, movedFromId: old.id };
    const nb = existing
      ? await tx.booking.update({ where: { id: existing.id }, data: { ...data, status: "ACTIVE", deletedAt: null, cancelReason: null, cancelledAt: null } })
      : await tx.booking.create({ data: { pilgrimId: old.pilgrimId, tripId: targetTripId, ...data } });
    await tx.payment.updateMany({ where: { bookingId: old.id }, data: { bookingId: nb.id } });
    await tx.booking.update({ where: { id: old.id }, data: { status: "MOVED" } });
    await clearAssignments(tx, old.id);
    await freeOfficeBeds(tx, [old.id]);
    await assignOfficeRooms(tx, targetTripId, [nb.id]); // assigned in the new trip
    await auditChanges(tx, user, "Booking", old.id, { tripId: old.tripId }, { tripId: targetTripId }, ["tripId"]);
    return { ok: true, id: nb.id } as Result;
  });
}

export interface FamilyMember { bookingId: string; pilgrimName: string; isHead: boolean; price: number | null; currency: Currency; paid: number; balance: number | null; roomType: string | null }

/** Everyone in a FAMILY group (active bookings): each keeps his own booking and price; the family account is their sum. */
export async function familyAccount(groupId: string) {
  const g = await db.familyGroup.findUnique({
    where: { id: groupId },
    include: { members: { include: { booking: { include: { pilgrim: true, payments: true, trip: true } } } } },
  });
  if (!g || g.kind !== "FAMILY") return null;
  const active = g.members.filter((m) => m.booking.status === "ACTIVE" && !m.booking.deletedAt);
  const members: FamilyMember[] = active
    .map((m) => {
      const b = m.booking;
      const pays = b.payments.map((x) => ({ kind: x.kind, credited: Number(x.credited) }));
      const p = b.pilgrim;
      return { bookingId: b.id, pilgrimName: [p.firstName, p.fatherName, p.grandfatherName, p.familyName].filter(Boolean).join(" "), isHead: m.isHead, price: b.priceAmount, currency: b.priceCurrency, paid: paidTotal(pays), balance: balance(b.priceAmount, pays), roomType: b.roomType };
    })
    .sort((a, b) => Number(b.isHead) - Number(a.isHead));
  const totals = new Map<Currency, { price: number; paid: number; balance: number }>();
  for (const m of members) {
    const t = totals.get(m.currency) ?? { price: 0, paid: 0, balance: 0 };
    t.price += m.price ?? 0; t.paid += m.paid; t.balance += m.balance ?? 0;
    totals.set(m.currency, t);
  }
  return { group: g, tripId: active[0]?.booking.tripId ?? null, members, totals: [...totals].map(([currency, t]) => ({ currency, price: round2(t.price), paid: round2(t.paid), balance: round2(t.balance) })) };
}

/**
 * One payment received for the whole family: split over the members' bookings, head first, each up to what it still owes.
 * Every member gets his own payment/receipt, so his own account stays correct.
 */
export async function addFamilyPayment(
  user: SessionUser, groupId: string,
  input: { amount: number; currency: Currency; rate?: number | null; method: PaymentMethod; paidAt: Date; note?: string; source?: PaymentSource; sourceAgentId?: string | null },
): Promise<Result> {
  const fam = await familyAccount(groupId);
  if (!fam) return fail("الأسرة غير موجودة");
  const priced = fam.members.filter((m) => m.price != null && m.balance != null && m.balance > 0.005);
  if (!priced.length) return fail("لا يوجد متبقٍ على أي فرد من الأسرة");
  if (new Set(priced.map((m) => m.currency)).size > 1) return fail("عملات حجوزات الأسرة مختلفة — سجّل الدفعة على كل فرد");
  const cur = priced[0].currency;
  if (!isMoney(input.amount) || input.amount <= 0) return fail("المبلغ يجب أن يكون رقماً أكبر من صفر (حتى خانتين عشريتين)");
  if (input.currency !== cur && (!input.rate || input.rate <= 0)) return fail("أدخل سعر الصرف (دينار لكل دولار) وقت التسديد");
  const rate = input.rate ?? 0;
  // the most each member can take, in the payment's own currency (down to the cent)
  const capacity = (rem: number) => floorCents(input.currency === cur ? rem : cur === "USD" ? rem * rate : rem / rate);
  const plan: { bookingId: string; amount: number }[] = [];
  let left = input.amount;
  for (const m of priced) {
    if (left <= 0) break;
    const take = round2(Math.min(left, capacity(m.balance!)));
    if (take > 0) { plan.push({ bookingId: m.bookingId, amount: take }); left = round2(left - take); }
  }
  if (left > 0.004) return fail("المبلغ أكبر من المتبقي على الأسرة");
  const head = fam.members.find((m) => m.isHead);
  const note = [`دفعة أسرة${head ? ` ${head.pilgrimName}` : ""}`, input.note].filter(Boolean).join(" — ");
  // all members' payments commit together or not at all
  return atomic(async (tx) => {
    let firstReceipt: number | undefined;
    for (const part of plan) {
      const r = await addPaymentTx(tx, user, part.bookingId, { kind: "PAYMENT", amount: part.amount, currency: input.currency, rate: input.rate, method: input.method, paidAt: input.paidAt, note, source: input.source, sourceAgentId: input.sourceAgentId });
      if (!r.ok) throw new Abort(r);
      firstReceipt ??= r.receiptNo;
    }
    return { ok: true, receiptNo: firstReceipt };
  });
}
