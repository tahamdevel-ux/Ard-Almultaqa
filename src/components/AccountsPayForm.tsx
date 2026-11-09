"use client";
import { useActionState, useState } from "react";
import { recordPayment, type FormState } from "@/app/(app)/bookings/[id]/actions";
import { DateInput } from "@/components/DateInput";
import { PaymentSourceFields } from "@/components/PaymentSourceFields";

export type PayBooking = { id: string; label: string; trip: string; agentId: string | null };

/** "تسجيل دفعة": pick the pilgrim's booking (search), then the usual payment fields plus the payment source. */
export function AccountsPayForm({ bookings, agents, rate, today, initialBooking }: { bookings: PayBooking[]; agents: { id: string; name: string }[]; rate: number; today: string; initialBooking?: string }) {
  const [q, setQ] = useState("");
  const [bookingId, setBookingId] = useState(initialBooking ?? "");
  const shown = bookings.filter((b) => !q || (b.label + " " + b.trip).toLowerCase().includes(q.toLowerCase()));
  const sel = bookings.find((b) => b.id === bookingId);
  const [st, action, pending] = useActionState((prev: FormState, f: FormData) => recordPayment(bookingId, "PAYMENT", prev, f), {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="label" htmlFor="pay-q">بحث عن المعتمر</label><input id="pay-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو رقم الجواز" /></div>
        <div><label className="label" htmlFor="pay-booking">المعتمر والرحلة *</label>
          <select id="pay-booking" className="input" value={bookingId} onChange={(e) => setBookingId(e.target.value)} required>
            <option value="" disabled>— اختر —</option>
            {(sel && !shown.slice(0, 300).includes(sel) ? [sel, ...shown.slice(0, 299)] : shown.slice(0, 300)).map((b) => <option key={b.id} value={b.id}>{b.label} — {b.trip}</option>)}
          </select></div>
      </div>
      <div className="flex flex-wrap items-end gap-2" key={sel?.id ?? "none"}>
        <div><label className="label">المبلغ</label><input name="amount" type="number" min={1} className="input w-32" dir="ltr" required /></div>
        <div><label className="label">العملة</label><select name="currency" defaultValue="USD" className="input w-24"><option value="USD">دولار</option><option value="IQD">دينار</option></select></div>
        <div><label className="label">سعر الصرف (إن كان بالدينار)</label><input name="rate" type="number" defaultValue={rate} className="input w-28" dir="ltr" /></div>
        <div><label className="label">الطريقة</label><select name="method" className="input w-24"><option value="CASH">نقداً</option><option value="TRANSFER">حوالة</option><option value="CARD">بطاقة</option><option value="OTHER">أخرى</option></select></div>
        <div><label className="label">التاريخ</label><DateInput name="paidAt" defaultValue={today} className="input w-28" /></div>
        <PaymentSourceFields agents={agents} defaultAgentId={sel?.agentId} />
        <div><label className="label">ملاحظة</label><input name="note" className="input w-40" /></div>
        <button className="btn" disabled={pending || !bookingId}>تسجيل الدفعة</button>
      </div>
      {st.error && <p role="alert" className="alert-bad">{st.error}</p>}
      {st.ok && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">تم تسجيل الدفعة{st.receiptNo ? ` — وصل رقم ${st.receiptNo}` : ""}. <a className="underline" href="/accounts?tab=payments">سجل الدفعات</a></p>}
    </form>
  );
}
