"use client";
import { useActionState } from "react";
import type { TripActionState } from "@/app/(app)/trips/actions";

type Act = (p: TripActionState, f: FormData) => Promise<TripActionState>;
const KINDS: [string, string][] = [["SINGLE", "سنكل"], ["DOUBLE", "ثنائية"], ["TRIPLE", "ثلاثية"], ["QUAD", "رباعية"], ["QUINT", "خماسية"]];
export type HotelRow = { hotelId: string; name: string; used: number; prices: Record<string, number>; noHousingPrice: number | null };

function Status({ st }: { st: TripActionState }) {
  return <>{st.error && <p role="alert" className="text-xs font-bold text-red-700">{st.error}</p>}{st.ok && <p role="status" className="text-xs font-bold text-emerald-800">تم الحفظ</p>}</>;
}

/** Makkah hotels of the trip with a price per room type + «بدون سكن» each (USD). */
export function HotelPricesForm({ action, rows, candidates }: { action: Act; rows: HotelRow[]; candidates: { id: string; name: string }[] }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  const free = candidates.filter((c) => !rows.some((r) => r.hotelId === c.id));
  const cells = (key: string, r?: HotelRow) => (
    <>
      {KINDS.map(([k, l]) => <td key={k} className="td"><input aria-label={l} name={`${key}_${k}`} type="number" min={0} step="0.01" defaultValue={r?.prices[k] ?? ""} className="input w-24" dir="ltr" /></td>)}
      <td className="td"><input aria-label="بدون سكن" name={`${key}_NOHOUSING`} type="number" min={0} step="0.01" defaultValue={r?.noHousingPrice ?? ""} className="input w-24" dir="ltr" /></td>
    </>
  );
  return (
    <form action={fa} className="space-y-2">
      <div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">فندق مكة</th>{KINDS.map(([k, l]) => <th key={k} className="th">{l}</th>)}<th className="th">بدون سكن</th><th className="th">حذف</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.hotelId}><td className="td font-bold">{r.name}{r.used > 0 && <span className="chip chip-gray mr-1">{r.used} معتمر</span>}</td>{cells(`h_${r.hotelId}`, r)}
              <td className="td">{r.used === 0 ? <label className="text-xs"><input type="checkbox" name={`h_${r.hotelId}_remove`} value="1" /> حذف</label> : "—"}</td></tr>
          ))}
          {free.length > 0 && (
            <tr><td className="td"><select name="newHotel" aria-label="إضافة فندق" className="input w-56" defaultValue=""><option value="">+ إضافة فندق مكة…</option>{free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>{cells("new")}<td className="td" /></tr>
          )}
          {rows.length === 0 && free.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={8}>لا توجد فنادق في مكة — أضفها من صفحة الفنادق</td></tr>}
        </tbody>
      </table></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="applyToExisting" value="1" /> تطبيق الأسعار على المعتمرين الحاليين (يُعاد حساب سعر كل معتمر حسب فندقه ونوع غرفته)</label>
      <button className="btn" disabled={pending}>حفظ الأسعار</button>
      <Status st={st} />
      <p className="text-xs text-brand-mid">الأسعار بالدولار. فندق المدينة ثابت للرحلة ولا يؤثر على السعر. نوع الغرفة (ثنائية/ثلاثية…) ينطبق على مكة والمدينة معاً. اترك الخانة فارغة إذا لم يكن النوع متاحاً.</p>
    </form>
  );
}

export function TripExtrasForm({ action, air, values, agents }: { action: Act; air: boolean; values: { foodDefault: boolean; sarfAmount: number | null; agentCommission: number | null }; agents: { id: string; name: string; amount: number | null }[] }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  return (
    <form action={fa} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="foodDefault">الطعام (افتراضي المعتمرين)</label>
          <select id="foodDefault" name="foodDefault" className="input w-36" defaultValue={values.foodDefault ? "1" : "0"}><option value="1">مع طعام</option><option value="0">بدون طعام</option></select></div>
        {air && <div><label className="label" htmlFor="sarfAmount">مبلغ التصريف (دولار)</label><input id="sarfAmount" name="sarfAmount" type="number" min={0} step="0.01" className="input w-32" dir="ltr" defaultValue={values.sarfAmount ?? ""} /></div>}
        <div><label className="label" htmlFor="agentCommission">عمولة الوكيل الثابتة لكل معتمر (دولار)</label><input id="agentCommission" name="agentCommission" type="number" min={0} step="0.01" className="input w-36" dir="ltr" defaultValue={values.agentCommission ?? ""} placeholder="غير محدد" /></div>
      </div>
      {agents.length > 0 && (
        <details><summary className="cursor-pointer text-sm underline">عمولة مختلفة لوكيل معيّن في هذه الرحلة</summary>
          <div className="mt-2 flex flex-wrap gap-2">{agents.map((a) => <div key={a.id}><label className="label" htmlFor={"ag_" + a.id}>{a.name}</label><input id={"ag_" + a.id} name={"ag_" + a.id} type="number" min={0} step="0.01" className="input w-28" dir="ltr" defaultValue={a.amount ?? ""} placeholder="الافتراضي" /></div>)}</div>
        </details>
      )}
      <button className="btn" disabled={pending}>حفظ</button>
      <Status st={st} />
    </form>
  );
}

/** Merge a hotel that was entered twice: the pilgrims move to the kept row, the other row is deleted. */
export function MergeHotelRows({ action, rows }: { action: Act; rows: { hotelId: string; rowId: string; name: string; used: number }[] }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  if (rows.length < 2) return null;
  return (
    <form action={fa} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-canvas p-3 text-sm" onSubmit={(e) => { if (!window.confirm("دمج الصفّين؟ يُنقل المعتمرون إلى الصف المُبقى ويُحذف الآخر ويُعاد حساب أسعارهم منه.")) e.preventDefault(); }}>
      <div><label className="label" htmlFor="merge-from">دمج صف مكرر</label>
        <select id="merge-from" name="from" className="input w-56" defaultValue=""><option value="">— الصف الذي يُحذف —</option>{rows.map((r) => <option key={r.rowId} value={r.rowId}>{r.name} ({r.used} معتمر)</option>)}</select></div>
      <div><label className="label" htmlFor="merge-into">داخل</label>
        <select id="merge-into" name="into" className="input w-56" defaultValue=""><option value="">— الصف الذي يبقى —</option>{rows.map((r) => <option key={r.rowId} value={r.rowId}>{r.name} ({r.used} معتمر)</option>)}</select></div>
      <button className="btn-secondary" disabled={pending}>دمج</button>
      {st.error && <span role="alert" className="text-xs font-bold text-red-700">{st.error}</span>}
      {st.warning && <span role="status" className="text-xs font-bold text-emerald-800">{st.warning}</span>}
    </form>
  );
}
