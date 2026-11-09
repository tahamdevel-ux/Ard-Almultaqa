import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip } from "@/server/trips";
import { getSetting } from "@/server/settings";
import { familyAccount } from "@/server/payments";
import { formatDate } from "@/domain/dates";
import { tripLabel } from "@/lib/tripLabel";
import { formatMoney } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { MoneyForm } from "@/components/MoneyForm";
import { DateInput } from "@/components/DateInput";
import { PaymentSourceFields } from "@/components/PaymentSourceFields";
import { payFamily } from "./actions";

const METHOD = { CASH: "نقداً", TRANSFER: "حوالة", CARD: "بطاقة", OTHER: "أخرى" } as const;

export default async function FamilyPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requirePage("payments.view");
  const { groupId } = await params;
  const fam = await familyAccount(groupId);
  if (!fam || !fam.tripId) notFound();
  const trip = await db.trip.findUniqueOrThrow({ where: { id: fam.tripId } });
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const head = fam.members.find((m) => m.isHead);
  const rate = await getSetting("usdRate");
  const wp = can(user.role, "payments.record");
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const today = formatDate(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const cur = fam.members.find((m) => m.price != null)?.currency ?? "USD";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">حساب الأسرة{head ? ` — ${head.pilgrimName}` : ""}</h1>
        <p className="text-sm text-brand-mid"><Link className="underline" href={`/trips/${trip.id}`}>{tripLabel(trip)}</Link> · {fam.members.length} أفراد · رب الأسرة: {head?.pilgrimName ?? "غير محدد"}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {fam.totals.map((t) => (
          <div key={t.currency} className="contents">
            <div className="card text-center"><div className="text-xs text-brand-mid">مجموع الأسعار</div><div className="text-lg font-bold">{formatMoney(t.price, t.currency)}</div></div>
            <div className="card text-center"><div className="text-xs text-brand-mid">مجموع المدفوع</div><div className="text-lg font-bold text-green-800">{formatMoney(t.paid, t.currency)}</div></div>
            <div className="card text-center"><div className="text-xs text-brand-mid">المتبقي على الأسرة</div><div className={"text-lg font-bold " + (t.balance > 0 ? "text-red-700" : "")}>{formatMoney(t.balance, t.currency)}</div></div>
          </div>
        ))}
      </div>
      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["الاسم", "الغرفة", "السعر", "المدفوع", "المتبقي", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {fam.members.map((m) => (
              <tr key={m.bookingId}>
                <td className="td font-bold">{m.pilgrimName}{m.isHead && <span className="chip chip-ok ms-2">رب الأسرة</span>}</td>
                <td className="td">{m.roomType ? ROOM_TYPE_LABELS[m.roomType as keyof typeof ROOM_TYPE_LABELS] : "—"}</td>
                <td className="td">{m.price == null ? <span className="chip chip-warn">بلا سعر</span> : formatMoney(m.price, m.currency)}</td>
                <td className="td">{formatMoney(m.paid, m.currency)}</td>
                <td className="td">{m.balance == null ? "—" : formatMoney(m.balance, m.currency)}</td>
                <td className="td"><Link className="underline" href={`/bookings/${m.bookingId}`}>حسابه</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {wp && (
        <section className="card space-y-2">
          <h2 className="font-bold">استلام دفعة للأسرة</h2>
          <MoneyForm action={payFamily.bind(null, groupId)} submit="تسجيل دفعة الأسرة">
            <div><label className="label">المبلغ</label><input name="amount" type="number" min={1} className="input w-32" dir="ltr" required /></div>
            <div><label className="label">العملة</label><select name="currency" defaultValue={cur} className="input w-24"><option value="USD">دولار</option><option value="IQD">دينار</option></select></div>
            <div><label className="label">سعر الصرف (إن كان بالدينار)</label><input name="rate" type="number" defaultValue={rate} className="input w-28" dir="ltr" /></div>
            <div><label className="label">الطريقة</label><select name="method" className="input w-24">{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label">التاريخ</label><DateInput name="paidAt" defaultValue={today} className="input w-28" /></div>
            <PaymentSourceFields agents={agents} />
            <div><label className="label">ملاحظة</label><input name="note" className="input w-40" /></div>
          </MoneyForm>
          <p className="text-xs text-brand-mid">يُوزَّع المبلغ على أفراد الأسرة بدءاً برب الأسرة، كل فرد حتى ما يتبقى عليه، ويحصل كل فرد على وصله الخاص فيبقى حسابه صحيحاً.</p>
        </section>
      )}
    </div>
  );
}
