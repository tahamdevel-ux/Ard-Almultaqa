"use client";
import { useActionState } from "react";
import type { TripActionState } from "@/app/(app)/trips/actions";
import type { PriceAudit } from "@/server/tripHotels";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { formatMoney } from "@/domain/money";

/** Shows what is wrong with a trip's prices and payments, and recalculates prices from the hotel table on request. */
export function RecalcPrices({ action, audit, canEdit }: { action: (p: TripActionState, f: FormData) => Promise<TripActionState>; audit: PriceAudit; canEdit: boolean }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  const issues = audit.noPrice + audit.differs + audit.groups.length + audit.duplicateHotels.length + audit.badPayments + audit.paymentsOnInactive;
  if (!issues && !st.warning && !st.error) return null;
  const typeLabel = (t: string) => (t === "NOHOUSING" ? "بدون سكن" : ROOM_TYPE_LABELS[t as keyof typeof ROOM_TYPE_LABELS] ?? t);
  return (
    <section className="alert-warn space-y-2" aria-label="مراجعة الأسعار والدفعات">
      <ul className="list-none space-y-1">
        {audit.noPrice > 0 && <li>⚠ {audit.noPrice} معتمر بلا سعر.</li>}
        {audit.differs > 0 && <li>⚠ {audit.differs} معتمر سعره يختلف عن جدول الفندق.</li>}
        {audit.groups.map((g) => (
          <li key={g.hotel + g.roomType}>⚠ <b>{g.hotel}</b> — {typeLabel(g.roomType)}: أسعار مختلفة لنفس الفندق ونوع الغرفة: {g.entries.map((e) => `${formatMoney(e.base, "USD")} × ${e.count}${e.manual ? " (يدوي)" : ""}`).join("، ")}</li>
        ))}
        {audit.duplicateHotels.map((n) => <li key={n}>⚠ الفندق «{n}» مكرر في جدول أسعار الرحلة — كل صف له أسعاره الخاصة، احذف الصف الزائد بعد نقل المعتمرين منه.</li>)}
        {audit.badPayments > 0 && <li>⚠ {audit.badPayments} دفعة قيمتها المحتسبة لا تطابق المبلغ × سعر الصرف.</li>}
        {audit.paymentsOnInactive > 0 && <li>⚠ {audit.paymentsOnInactive} دفعة على حجز منقول.</li>}
        {audit.manual > 0 && <li className="font-normal">({audit.manual} بسعر يدوي لا يتغير عند إعادة الحساب.)</li>}
      </ul>
      {st.warning && <p role="status" className="font-bold text-emerald-900">{st.warning}</p>}
      {st.error && <p role="alert" className="font-bold text-red-800">{st.error}</p>}
      {canEdit && (audit.noPrice > 0 || audit.differs > 0) && (
        <form action={fa}><button className="btn" disabled={pending}>{pending ? "جارٍ الحساب…" : "أعد حساب الأسعار من جدول الفندق"}</button></form>
      )}
    </section>
  );
}
