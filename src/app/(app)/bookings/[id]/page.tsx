import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip, TRIP_ORDER } from "@/server/trips";
import { getSetting } from "@/server/settings";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { tripLabel } from "@/lib/tripLabel";
import { balance, formatMoney, paidTotal } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { MoneyForm } from "@/components/MoneyForm";
import { cancel, move, recordPayment, savePrice } from "./actions";
import { DateInput } from "@/components/DateInput";
import { PaymentSourceFields } from "@/components/PaymentSourceFields";

const METHOD = { CASH: "نقداً", TRANSFER: "حوالة", CARD: "بطاقة", OTHER: "أخرى" } as const;

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("payments.view");
  const { id } = await params;
  const b = await db.booking.findUnique({ where: { id }, include: { pilgrim: true, trip: true, tripHotel: { include: { hotel: true, prices: true } }, agent: true, payments: { orderBy: { receiptNo: "asc" } }, groups: { include: { group: true } } } });
  if (!b) notFound();
  if (!canSeeTrip(user, b.trip)) redirect("/forbidden");
  const rate = await getSetting("usdRate");
  const cur = b.priceCurrency;
  const pays = b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }));
  const paid = paidTotal(pays);
  const bal = balance(b.priceAmount, pays);
  const wp = can(user.role, "payments.write"), wrec = can(user.role, "payments.record"), wpr = can(user.role, "prices.write");
  const today = formatDate(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const otherTrips = can(user.role, "bookings.write") ? await db.trip.findMany({ where: { deletedAt: null, archivedAt: null, id: { not: b.tripId }, status: { in: ["OPEN", "FULL"] } }, orderBy: TRIP_ORDER }) : [];
  const active = b.status === "ACTIVE";
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const family = b.groups.find((g) => g.group.kind === "FAMILY");

  const payFields = (kind: "PAYMENT" | "REFUND") => (
    <>
      <div><label className="label">المبلغ</label><input name="amount" type="number" min={1} className="input w-32" dir="ltr" required /></div>
      <div><label className="label">العملة</label><select name="currency" defaultValue={cur} className="input w-24"><option value="USD">دولار</option><option value="IQD">دينار</option></select></div>
      <div><label className="label">سعر الصرف (إن كان بالدينار)</label><input name="rate" type="number" defaultValue={rate} className="input w-28" dir="ltr" /></div>
      <div><label className="label">الطريقة</label><select name="method" className="input w-24">{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div><label className="label">التاريخ</label><DateInput name="paidAt" defaultValue={today} className="input w-28" /></div>
      {kind === "REFUND" ? <div><label className="label">السبب *</label><input name="reason" className="input w-40" required /></div> : <><PaymentSourceFields agents={agents} defaultAgentId={b.agentId} /><div><label className="label">ملاحظة</label><input name="note" className="input w-40" /></div></>}
    </>
  );

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "الرحلات", href: "/trips" }, { label: tripLabel(b.trip), href: `/trips/${b.tripId}` }, { label: "حساب الحجز" }]} />
      <div>
        <h1 className="page-title">حساب الحجز — {fullNameAr(b.pilgrim)}</h1>
        <p className="text-sm text-brand-mid">
          <Link className="underline" href={`/pilgrims/${b.pilgrimId}`}>ملف المعتمر</Link> · <Link className="underline" href={`/trips/${b.tripId}`}>{tripLabel(b.trip)}</Link>
          {b.agent && ` · الوكيل: ${b.agent.name}`} · الحالة: {b.status === "ACTIVE" ? "فعّال" : b.status === "CANCELLED" ? `ملغى (${b.cancelReason})` : "منقول إلى رحلة أخرى"}
        </p>
      </div>
      {family && <p className="alert-warn">هذا المعتمر ضمن أسرة — <Link className="underline" href={`/families/${family.groupId}`}>حساب الأسرة{family.isHead ? " (هو رب الأسرة)" : ""}</Link></p>}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card"><div className="text-xs text-brand-mid">السعر</div><div className="text-lg font-bold">{b.priceAmount == null ? "غير محدد" : formatMoney(b.priceAmount, cur)}</div></div>
        <div className="card"><div className="text-xs text-brand-mid">المدفوع (صافي)</div><div className="text-lg font-bold text-green-800">{formatMoney(paid, cur)}</div></div>
        <div className="card"><div className="text-xs text-brand-mid">المتبقي</div><div className={"text-lg font-bold " + ((bal ?? 0) > 0 ? "text-red-700" : "")}>{bal == null ? "—" : formatMoney(bal, cur)}</div></div>
      </div>

      {b.priceAmount != null && (() => {
        const th = b.tripHotel, table = th ? (b.noHousing ? th.noHousingPrice : th.prices.find((p) => p.roomType === b.roomType)?.amount) : null;
        const expected = table == null ? null : table + b.sarfAmount;
        return (
          <p className={"text-xs " + (b.priceManual || (expected != null && expected !== b.priceAmount) ? "alert-warn" : "text-brand-mid")}>
            {th && table != null ? `جدول الفندق: ${th.hotel.localName ?? th.hotel.officialName} — ${b.noHousing ? "بدون سكن" : ROOM_TYPE_LABELS[b.roomType as keyof typeof ROOM_TYPE_LABELS]} ${formatMoney(table, "USD")}${b.sarfAmount ? ` + تصريف ${formatMoney(b.sarfAmount, "USD")}` : ""} = ${formatMoney(expected!, "USD")}` : "لا يوجد سعر في جدول فنادق الرحلة لهذا الحجز."}
            {b.priceManual ? " — السعر الحالي مكتوب يدوياً ولا يتغير مع الجدول." : expected != null && expected !== b.priceAmount ? " — السعر الحالي يختلف عن الجدول." : ""}
          </p>
        );
      })()}

      {wpr && active && (
        <section className="card space-y-2">
          <h2 className="font-bold">نوع الغرفة والسعر</h2>
          <MoneyForm action={savePrice.bind(null, b.id)} submit="حفظ">
            <div><label className="label">نوع الغرفة</label><select name="roomType" defaultValue={b.roomType ?? ""} className="input w-32"><option value="">—</option>{Object.entries(ROOM_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label">السعر (فارغ = سعر الرحلة الافتراضي)</label><input name="amount" type="number" min={0} defaultValue={b.priceAmount ?? ""} className="input w-36" dir="ltr" /></div>
          </MoneyForm>
          <p className="text-xs text-brand-mid">السعر موحّد حسب نوع الغرفة (يُحدَّد من صفحة الرحلة) ويمكن تعديله لحجز معيّن. الأسعار دائماً بالدولار؛ يمكن استلام الدفعة بالدينار بسعر صرف.</p>
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

      {wrec && active && (
        <section className="card space-y-2">
          <h2 className="font-bold">استلام دفعة</h2>
          <MoneyForm action={recordPayment.bind(null, b.id, "PAYMENT")} submit="تسجيل الدفعة">{payFields("PAYMENT")}</MoneyForm>
          <p className="text-xs text-brand-mid">عند الدفع بالدينار اكتب سعر الصرف الفعلي وقت التسديد؛ يُحتسب المبلغ بالدولار تلقائياً.</p>
        </section>
      )}
      {wp && b.payments.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">استرداد مبلغ</h2>
          <MoneyForm action={recordPayment.bind(null, b.id, "REFUND")} submit="تسجيل الاسترداد" danger confirm="تسجيل استرداد مبلغ لهذا الحجز؟ سيُنقص المدفوع ويُسجَّل في السجل.">{payFields("REFUND")}</MoneyForm>
        </section>
      )}
      {wp && active && (
        <section className="card space-y-2">
          <h2 className="font-bold">إلغاء الحجز</h2>
          <MoneyForm action={cancel.bind(null, b.id)} submit="إلغاء الحجز" danger confirm="إلغاء هذا الحجز؟ يُحرَّر المقعد والغرفة ولا يمكن التراجع من الشاشة.">
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
            <div><label className="label">الرحلة</label><select name="tripId" className="input w-64">{otherTrips.map((t) => <option key={t.id} value={t.id}>{tripLabel(t)}{t.departDate ? ` (${formatDate(t.departDate)})` : ""}</option>)}</select></div>
          </MoneyForm>
          <p className="text-xs text-brand-mid">تنتقل الدفعات والسعر مع الحجز، ويبقى الحجز القديم في السجل بحالة «منقول».</p>
        </section>
      )}
    </div>
  );
}
