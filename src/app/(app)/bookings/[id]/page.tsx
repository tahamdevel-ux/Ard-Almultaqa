import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip } from "@/server/trips";
import { getSetting } from "@/server/settings";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { balance, formatMoney, paidTotal } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { MoneyForm } from "@/components/MoneyForm";
import { cancel, move, recordPayment, savePrice } from "./actions";

const METHOD = { CASH: "نقداً", TRANSFER: "حوالة", CARD: "بطاقة", OTHER: "أخرى" } as const;

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("payments.view");
  const { id } = await params;
  const b = await db.booking.findUnique({ where: { id }, include: { pilgrim: true, trip: true, agent: true, payments: { orderBy: { receiptNo: "asc" } } } });
  if (!b) notFound();
  if (!canSeeTrip(user, b.trip)) redirect("/forbidden");
  const rate = await getSetting("usdRate");
  const cur = b.priceCurrency;
  const pays = b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }));
  const paid = paidTotal(pays);
  const bal = balance(b.priceAmount, pays);
  const wp = can(user.role, "payments.write"), wpr = can(user.role, "prices.write");
  const today = formatDate(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const otherTrips = can(user.role, "bookings.write") ? await db.trip.findMany({ where: { deletedAt: null, id: { not: b.tripId }, status: { in: ["OPEN", "FULL"] } }, orderBy: { departDate: "asc" } }) : [];
  const active = b.status === "ACTIVE";

  const payFields = (kind: "PAYMENT" | "REFUND") => (
    <>
      <div><label className="label">المبلغ</label><input name="amount" type="number" min={1} className="input w-32" dir="ltr" required /></div>
      <div><label className="label">العملة</label><select name="currency" defaultValue={cur} className="input w-24"><option value="USD">دولار</option><option value="IQD">دينار</option></select></div>
      <div><label className="label">سعر الصرف (إن كان بالدينار)</label><input name="rate" type="number" defaultValue={rate} className="input w-28" dir="ltr" /></div>
      <div><label className="label">الطريقة</label><select name="method" className="input w-24">{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div><label className="label">التاريخ</label><input name="paidAt" defaultValue={today} className="input w-28" dir="ltr" /></div>
      {kind === "REFUND" ? <div><label className="label">السبب *</label><input name="reason" className="input w-40" required /></div> : <div><label className="label">ملاحظة</label><input name="note" className="input w-40" /></div>}
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">حساب الحجز — {fullNameAr(b.pilgrim)}</h1>
        <p className="text-sm text-brand-mid">
          <Link className="underline" href={`/pilgrims/${b.pilgrimId}`}>ملف المعتمر</Link> · <Link className="underline" href={`/trips/${b.tripId}`}>{b.trip.tripNo} {b.trip.name}</Link>
          {b.agent && ` · الوكيل: ${b.agent.name}`} · الحالة: {b.status === "ACTIVE" ? "فعّال" : b.status === "CANCELLED" ? `ملغى (${b.cancelReason})` : "منقول إلى رحلة أخرى"}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card"><div className="text-xs text-brand-mid">السعر</div><div className="text-lg font-bold">{b.priceAmount == null ? "غير محدد" : formatMoney(b.priceAmount, cur)}</div></div>
        <div className="card"><div className="text-xs text-brand-mid">المدفوع (صافي)</div><div className="text-lg font-bold text-green-800">{formatMoney(paid, cur)}</div></div>
        <div className="card"><div className="text-xs text-brand-mid">المتبقي</div><div className={"text-lg font-bold " + ((bal ?? 0) > 0 ? "text-red-700" : "")}>{bal == null ? "—" : formatMoney(bal, cur)}</div></div>
      </div>

      {wpr && active && (
        <section className="card space-y-2">
          <h2 className="font-bold">نوع الغرفة والسعر</h2>
          <MoneyForm action={savePrice.bind(null, b.id)} submit="حفظ">
            <div><label className="label">نوع الغرفة</label><select name="roomType" defaultValue={b.roomType ?? ""} className="input w-32"><option value="">—</option>{Object.entries(ROOM_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label">السعر (فارغ = سعر الرحلة الافتراضي)</label><input name="amount" type="number" min={0} defaultValue={b.priceAmount ?? ""} className="input w-36" dir="ltr" /></div>
            <input type="hidden" name="currency" value={cur} />
          </MoneyForm>
          <p className="text-xs text-brand-mid">السعر موحّد حسب نوع الغرفة (يُحدَّد من صفحة الرحلة) ويمكن تعديله لحجز معيّن. العملة الأساسية: {cur === "USD" ? "الدولار" : "الدينار"}.</p>
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <h2 className="p-3 font-bold">الدفعات</h2>
        <table className="w-full">
          <thead><tr>{["الوصل", "التاريخ", "النوع", "المبلغ", "سعر الصرف", `القيمة بال${cur === "USD" ? "دولار" : "دينار"}`, "الطريقة", "استلمها", "ملاحظة / سبب", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {b.payments.map((p) => (
              <tr key={p.id}>
                <td className="td ltr">{p.receiptNo}</td><td className="td">{formatDate(p.paidAt)}</td>
                <td className="td"><span className={"chip " + (p.kind === "PAYMENT" ? "chip-ok" : "chip-bad")}>{p.kind === "PAYMENT" ? "دفعة" : "استرداد"}</span></td>
                <td className="td">{formatMoney(p.amount, p.currency)}</td><td className="td ltr">{p.exchangeRate ?? ""}</td>
                <td className="td">{formatMoney(Number(p.credited), cur)}</td><td className="td">{METHOD[p.method]}</td><td className="td">{p.receivedByName}</td>
                <td className="td">{p.reason ?? p.note}</td>
                <td className="td"><a className="underline" href={`/api/payments/${p.id}/receipt`}>وصل PDF</a></td>
              </tr>
            ))}
            {b.payments.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={10}>لا توجد دفعات</td></tr>}
          </tbody>
        </table>
      </section>

      {wp && active && (
        <section className="card space-y-2">
          <h2 className="font-bold">استلام دفعة</h2>
          <MoneyForm action={recordPayment.bind(null, b.id, "PAYMENT")} submit="تسجيل الدفعة">{payFields("PAYMENT")}</MoneyForm>
          <p className="text-xs text-brand-mid">عند الدفع بالدينار اكتب سعر الصرف الفعلي وقت التسديد؛ يُحتسب المبلغ بالدولار تلقائياً.</p>
        </section>
      )}
      {wp && b.payments.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">استرداد مبلغ</h2>
          <MoneyForm action={recordPayment.bind(null, b.id, "REFUND")} submit="تسجيل الاسترداد" danger>{payFields("REFUND")}</MoneyForm>
        </section>
      )}
      {wp && active && (
        <section className="card space-y-2">
          <h2 className="font-bold">إلغاء الحجز</h2>
          <MoneyForm action={cancel.bind(null, b.id)} submit="إلغاء الحجز" danger>
            <div><label className="label">سبب الإلغاء *</label><input name="reason" className="input w-48" required /></div>
            <div><label className="label">مبلغ يُردّ (اختياري)</label><input name="refundAmount" type="number" min={0} className="input w-28" dir="ltr" /></div>
            <div><label className="label">العملة</label><select name="currency" defaultValue={cur} className="input w-24"><option value="USD">دولار</option><option value="IQD">دينار</option></select></div>
            <div><label className="label">سعر الصرف</label><input name="rate" type="number" defaultValue={rate} className="input w-24" dir="ltr" /></div>
            <input type="hidden" name="method" value="CASH" /><input type="hidden" name="paidAt" value={today} />
          </MoneyForm>
          <p className="text-xs text-brand-mid">يُحرَّر المقعد والغرفة. المبلغ غير المسترد يبقى للشركة ويظهر في كشف الوكيل.</p>
        </section>
      )}
      {active && otherTrips.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">نقل المعتمر إلى رحلة أخرى</h2>
          <MoneyForm action={move.bind(null, b.id)} submit="نقل">
            <div><label className="label">الرحلة</label><select name="tripId" className="input w-64">{otherTrips.map((t) => <option key={t.id} value={t.id}>{t.tripNo} — {t.name} ({formatDate(t.departDate)})</option>)}</select></div>
          </MoneyForm>
          <p className="text-xs text-brand-mid">تنتقل الدفعات والسعر مع الحجز، ويبقى الحجز القديم في السجل بحالة «منقول».</p>
        </section>
      )}
    </div>
  );
}
