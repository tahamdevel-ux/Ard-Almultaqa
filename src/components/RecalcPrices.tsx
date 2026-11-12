"use client";
import { useActionState } from "react";
import type { TripActionState } from "@/app/(app)/trips/actions";

/** Shows what is wrong with a trip's prices and recalculates them from the hotel table on request. */
export function RecalcPrices({ action, audit, canEdit }: { action: (p: TripActionState, f: FormData) => Promise<TripActionState>; audit: { noPrice: number; differs: number; manual: number }; canEdit: boolean }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  if (!audit.noPrice && !audit.differs && !st.warning && !st.error) return null;
  return (
    <section className="alert-warn flex flex-wrap items-center justify-between gap-2" aria-label="مراجعة الأسعار">
      <p>
        {audit.noPrice > 0 && <span>⚠ {audit.noPrice} معتمر بلا سعر. </span>}
        {audit.differs > 0 && <span>⚠ {audit.differs} معتمر سعره يختلف عن جدول الفندق. </span>}
        {audit.manual > 0 && <span className="font-normal">({audit.manual} بسعر يدوي لا يتغير.)</span>}
        {st.warning && <span role="status" className="block font-bold text-emerald-900">{st.warning}</span>}
        {st.error && <span role="alert" className="block text-red-800">{st.error}</span>}
      </p>
      {canEdit && (
        <form action={fa}><button className="btn" disabled={pending}>{pending ? "جارٍ الحساب…" : "أعد حساب الأسعار من جدول الفندق"}</button></form>
      )}
    </section>
  );
}
