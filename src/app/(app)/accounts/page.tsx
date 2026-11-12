import Link from "next/link";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { accountsOverview, paymentsLog } from "@/server/accounts";
import { parsePeriod, PERIOD_LABELS, type Period } from "@/domain/accounts";
import { remainingState } from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { tripLabel } from "@/lib/tripLabel";
import { Bar, StatCard } from "@/components/charts";
import { Icon } from "@/components/icons";

type Tab = "trips" | "pilgrims" | "agents" | "payments";
const TABS: [Tab, string][] = [["trips", "الرحلات"], ["pilgrims", "المعتمرين"], ["agents", "الوكلاء"], ["payments", "سجل الدفعات"]];
const usd = (n: number) => formatMoney(n, "USD");
const num = "px-3 py-2 text-right tabular-nums"; // money columns: right-aligned
const remainCls = (n: number) => { const k = remainingState(n).kind; return k === "owed" ? " font-bold text-red-700" : k === "extra" ? " font-bold text-green-800" : ""; };
const remainTxt = (n: number) => { const r = remainingState(n); return r.kind === "extra" ? `زيادة مدفوعة ${usd(r.abs)}` : usd(r.abs); };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("payments.view");
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0]) ?? "trips";
  const q = (sp.q ?? "").trim();
  const f = { period, trip: sp.trip || undefined, agent: sp.agent || undefined, onlyDue: sp.due === "1", hideArchived: sp.hideArchived === "1" };
  const data = await accountsOverview(f);
  const log = tab === "payments" ? await paymentsLog(period, q) : [];
  const link = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { period: period === "all" ? undefined : period, tab, hideArchived: f.hideArchived ? "1" : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return "/accounts" + (s ? `?${s}` : "");
  };
  const filterTrip = f.trip ? data.tripRows.find((t) => t.trip.id === f.trip)?.trip : undefined;
  const filterAgent = f.agent ? data.agents.find((a) => a.id === f.agent) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">الحسابات</h1>
        {can(user.role, "payments.record") && <Link href="/accounts/pay" className="btn">تسجيل دفعة</Link>}
      </div>

      <nav aria-label="الفترة" className="flex flex-wrap gap-2 text-sm">
        {(["month", "3m", "all"] as Period[]).map((p) => (
          <Link key={p} href={link({ period: p === "all" ? undefined : p })} aria-current={p === period ? "true" : undefined}
            className={"rounded-lg px-3 py-1.5 font-bold " + (p === period ? "bg-brand text-white" : "bg-white border border-line text-brand-dark")}>{PERIOD_LABELS[p]}</Link>
        ))}
        <Link href={link({ hideArchived: f.hideArchived ? undefined : "1" })} className={"rounded-lg px-3 py-1.5 font-bold border " + (f.hideArchived ? "bg-brand text-white border-brand" : "bg-white border-line text-brand-dark")}>إخفاء الرحلات المؤرشفة</Link>
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="المطلوب" value={usd(data.totals.due)} icon={<Icon name="wallet" size={22} />} />
        <StatCard label="المستلم" value={usd(data.totals.received)} icon={<Icon name="check" size={22} />} tone="green" />
        <StatCard label="الباقي" value={usd(data.totals.remaining)} icon={<Icon name="alert" size={22} />} tone="red" />
        <StatCard label="عمولات الوكلاء" value={usd(data.totals.commission)} icon={<Icon name="agent" size={22} />} tone="gold" />
      </div>

      <nav aria-label="الأقسام" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, l]) => (
          <Link key={k} href={link({ tab: k, trip: undefined, agent: undefined, due: undefined, q: undefined })} aria-current={k === tab ? "page" : undefined}
            className={"-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-bold " + (k === tab ? "border-line bg-white text-brand-dark" : "border-transparent text-brand-mid hover:text-brand-dark")}>{l}</Link>
        ))}
      </nav>

      {tab === "trips" && (
        <section className="card overflow-x-auto p-0">
          <table className="rt w-full">
            <thead><tr><th className="th">الرحلة</th><th className="th">المعتمرون</th><th className="th text-right">المطلوب</th><th className="th text-right">المستلم</th><th className="th text-right">الباقي</th><th className="th w-40">نسبة التسديد</th></tr></thead>
            <tbody>
              {data.tripRows.map((r) => (
                <tr key={r.trip.id} className="hover:bg-canvas">
                  <td className="td font-bold"><Link className="text-brand underline" href={link({ tab: "pilgrims", trip: r.trip.id })}>{tripLabel(r.trip)}</Link></td>
                  <td className="td">{r.pilgrims}</td>
                  <td className={num}>{usd(r.due)}</td><td className={num + " text-green-800"}>{usd(r.received)}</td>
                  <td className={num + remainCls(r.remaining)}>{remainTxt(r.remaining)}</td>
                  <td className="td"><Bar value={r.percent} max={100} tone={r.percent >= 100 ? "brand" : "gold"} /><span className="text-xs text-brand-mid">{r.percent}%</span></td>
                </tr>
              ))}
              {data.tripRows.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={6}>لا توجد رحلات في هذه الفترة</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === "pilgrims" && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {(filterTrip || filterAgent) && (
              <span className="chip chip-gray">{filterTrip ? `الرحلة: ${tripLabel(filterTrip)}` : `الوكيل: ${filterAgent?.name}`} <Link className="underline" href={link({ trip: undefined, agent: undefined })}>إزالة</Link></span>
            )}
            <Link className={"rounded-lg border px-3 py-1.5 font-bold " + (f.onlyDue ? "bg-brand text-white" : "bg-white border-line text-brand-dark")}
              href={link({ trip: f.trip, agent: f.agent, due: f.onlyDue ? undefined : "1" })}>عليهم باقي فقط</Link>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="rt w-full">
              <thead><tr><th className="th">الاسم</th><th className="th">الرحلة</th><th className="th">الوكيل</th><th className="th text-right">المطلوب</th><th className="th text-right">المستلم</th><th className="th text-right">الباقي</th></tr></thead>
              <tbody>
                {data.pilgrimRows.map((r) => (
                  <tr key={r.bookingId} className="hover:bg-canvas">
                    <td className="td font-bold"><Link className="text-brand underline" href={`/bookings/${r.bookingId}`}>{r.name}</Link>{r.status === "CANCELLED" && <span className="chip chip-bad ms-2">ملغى</span>}</td>
                    <td className="td">{tripLabel(r.trip)}</td><td className="td">{r.agent?.name ?? "—"}</td>
                    <td className={num}>{usd(r.due)}</td><td className={num + " text-green-800"}>{usd(r.received)}</td>
                    <td className={num + remainCls(r.remaining)}>{remainTxt(r.remaining)}</td>
                  </tr>
                ))}
                {data.pilgrimRows.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={6}>لا توجد نتائج</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "agents" && (
        <section className="card overflow-x-auto p-0">
          <table className="rt w-full">
            <thead><tr><th className="th">الوكيل</th><th className="th">المعتمرون</th><th className="th text-right">المطلوب</th><th className="th text-right">مستلم عن طريقه</th><th className="th text-right">مستلم مباشر من معتمريه</th><th className="th text-right">الباقي</th><th className="th text-right">العمولة</th></tr></thead>
            <tbody>
              {data.agentRows.map((r) => (
                <tr key={r.agent.id} className="hover:bg-canvas">
                  <td className="td font-bold"><Link className="text-brand underline" href={link({ tab: "pilgrims", agent: r.agent.id })}>{r.agent.name}</Link></td>
                  <td className="td">{r.pilgrims}</td>
                  <td className={num}>{usd(r.due)}</td><td className={num + " text-green-800"}>{usd(r.viaAgent)}</td><td className={num + " text-green-800"}>{usd(r.direct)}</td>
                  <td className={num + remainCls(r.remaining)}>{remainTxt(r.remaining)}</td><td className={num}>{usd(r.commission)}</td>
                </tr>
              ))}
              {data.agentRows.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={7}>لا يوجد وكلاء</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === "payments" && (
        <section className="space-y-2">
          <form className="flex gap-2" action="/accounts">
            {period !== "all" && <input type="hidden" name="period" value={period} />}<input type="hidden" name="tab" value="payments" />
            <input name="q" defaultValue={q} className="input" placeholder="بحث برقم الوصل أو اسم المعتمر" aria-label="بحث في الدفعات" />
            <button className="btn-secondary">بحث</button>
          </form>
          <div className="card overflow-x-auto p-0">
            <table className="rt w-full">
              <thead><tr>{["التاريخ", "رقم الوصل", "المعتمر", "الرحلة"].map((h) => <th key={h} className="th">{h}</th>)}<th className="th text-right">المبلغ (USD)</th><th className="th">بالدينار</th><th className="th">المصدر</th><th className="th">سجّلها</th></tr></thead>
              <tbody>
                {log.map((p) => {
                  const sign = p.kind === "PAYMENT" ? 1 : -1;
                  return (
                    <tr key={p.id} className="hover:bg-canvas">
                      <td className="td">{formatDate(p.paidAt)}</td>
                      <td className="td ltr"><a className="text-brand underline" href={`/api/payments/${p.id}/receipt`}>{p.receiptNo}</a>{p.kind === "REFUND" && <span className="chip chip-bad ms-1">استرداد</span>}</td>
                      <td className="td"><Link className="underline" href={`/bookings/${p.bookingId}`}>{p.pilgrimName}</Link></td>
                      <td className="td">{tripLabel(p.booking.trip)}</td>
                      <td className={num + (sign < 0 ? " text-red-700" : " text-green-800")}>{usd(sign * Number(p.credited))}</td>
                      <td className="td ltr">{p.currency === "IQD" ? `${p.amount.toLocaleString("en-US")} د.ع @ ${p.exchangeRate ?? ""}` : ""}</td>
                      <td className="td">{p.source === "AGENT" ? `عن طريق الوكيل${p.agentName ? ` (${p.agentName})` : ""}` : "مباشر"}</td>
                      <td className="td">{p.receivedByName}</td>
                    </tr>
                  );
                })}
                {log.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={8}>لا توجد دفعات</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
