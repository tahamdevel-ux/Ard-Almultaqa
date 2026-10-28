import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { fullNameAr } from "@/server/pilgrims";
import { agentStatementData } from "@/outputs/viewmodels";
import { formatMoney } from "@/domain/money";

export default async function AgentStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ trip?: string }> }) {
  await requirePage("payments.view");
  const { id } = await params;
  const { trip } = await searchParams;
  const agent = await db.agent.findFirst({ where: { id, deletedAt: null } });
  if (!agent) notFound();
  const [d, trips] = await Promise.all([agentStatementData(id, trip || undefined), db.trip.findMany({ where: { deletedAt: null }, orderBy: { departDate: "desc" } })]);
  const c = d.currency;
  const qs = trip ? `&trip=${trip}` : "";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">كشف حساب الوكيل: {agent.name}</h1>
        <div className="flex gap-2">
          <a className="btn-secondary" href={`/api/agents/${id}/statement?format=pdf${qs}`}>PDF</a>
          <a className="btn-secondary" href={`/api/agents/${id}/statement?format=xlsx${qs}`}>Excel</a>
          <Link href="/agents" className="btn-secondary">الوكلاء</Link>
        </div>
      </div>
      <form className="flex gap-2"><select name="trip" defaultValue={trip ?? ""} className="input w-64"><option value="">كل الرحلات</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.tripNo} — {t.name}</option>)}</select><button className="btn-secondary">عرض</button></form>
      <p className="text-sm text-brand-mid">العمولة: {agent.commissionType === "PERCENT" ? `${agent.commissionValue}% من السعر` : `سعر جملة ثابت ${formatMoney(Number(agent.commissionValue), c)} للمعتمر (الباقي للوكيل)`}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
        {([["المعتمرون", String(d.sum.count)], ["إجمالي الأسعار", formatMoney(d.sum.totalPrice, c)], ["العمولة", formatMoney(d.sum.commission, c)], ["المستلم", formatMoney(d.sum.collected, c)], [d.sum.dueToCompany >= 0 ? "المتبقي للشركة" : "زيادة مدفوعة", formatMoney(Math.abs(d.sum.dueToCompany), c)]] as const).map(([l, v]) => (
          <div key={l} className="card"><div className="text-xs text-brand-mid">{l}</div><div className="font-bold">{v}</div></div>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr>{["المعتمر", "الرحلة", "السعر", "المدفوع", "المتبقي", "الحالة"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.b.id}>
                <td className="td"><Link className="underline" href={`/bookings/${r.b.id}`}>{fullNameAr(r.b.pilgrim)}</Link></td><td className="td">{r.b.trip.tripNo}</td>
                <td className="td">{r.price == null ? "—" : formatMoney(r.price, c)}</td><td className="td">{formatMoney(r.paid, c)}</td>
                <td className="td">{r.price == null || r.cancelled ? "—" : formatMoney(r.price - r.paid, c)}</td>
                <td className="td">{r.cancelled ? <span className="chip chip-bad">ملغى</span> : <span className="chip chip-ok">فعّال</span>}</td>
              </tr>
            ))}
            {d.rows.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={6}>لا توجد حجوزات لهذا الوكيل</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
