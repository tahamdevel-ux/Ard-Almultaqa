"use client";
import { useActionState } from "react";
import { usePopover } from "@/components/usePopover";
import { computePrice } from "@/domain/pricing";
import type { TripActionState } from "@/app/(app)/trips/actions";

export type HotelOpt = { id: string; name: string; city: "MAKKAH" | "MADINAH" };
export type AccValues = { makkahHotelId: string; madinahHotelId: string; roomType: string; makkahRoomNo: string; madinahRoomNo: string; officeRoom?: string; tripRole?: string; housing?: string; food?: string; sarf?: string };
export type PricedHotel = { id: string; name: string };
/** Price table of one priced hotel (USD), for the live price line. */
export type PriceTables = Record<string, { prices: Record<string, number>; noHousing: number | null }>;
const TYPES = [["", "—"], ["SINGLE", "سنكل"], ["DOUBLE", "ثنائية"], ["TRIPLE", "ثلاثية"], ["QUAD", "رباعية"], ["QUINT", "خماسية"]];

/** Hotel per city, room type and room numbers for one pilgrim. Names match accommodationFromForm(). */
export function AccommodationFields({ hotels, values, onChange, idPrefix = "acc", nameSuffix = "", priced, air, tables, sarfAmount }: { hotels: HotelOpt[]; priced?: PricedHotel[]; air?: boolean; tables?: PriceTables; sarfAmount?: number | null; values: AccValues; onChange?: (v: AccValues) => void; idPrefix?: string; nameSuffix?: string }) {
  const set = (k: keyof AccValues) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => onChange?.({ ...values, [k]: e.target.value });
  const preview = (() => {
    if (!tables || !Object.keys(tables).length) return null;
    const tb = tables[values.makkahHotelId] ?? (priced && priced.length === 1 ? tables[priced[0].id] : undefined);
    if (!tb) return { text: "اختر فندق مكة لعرض السعر", ok: false };
    const r = computePrice({ table: { prices: tb.prices, noHousingPrice: tb.noHousing }, roomType: (values.roomType || null) as never, noHousing: values.housing === "NO", sarfByPilgrim: values.sarf === "PILGRIM", sarfAmount: sarfAmount ?? null });
    if (!r.ok) return { text: r.error, ok: false };
    const base = r.amount - r.sarf;
    return { text: `السعر حسب الجدول: ${values.housing === "NO" ? "بدون سكن" : TYPES.find(([k]) => k === values.roomType)?.[1]} $${base}${r.sarf ? ` + تصريف $${r.sarf}` : ""} = $${r.amount}`, ok: true };
  })();
  const mk = priced && priced.length ? priced : hotels.filter((h) => h.city === "MAKKAH");
  const pick = (k: keyof AccValues, def: string) => (onChange ? { value: values[k] ?? def, onChange: set(k) } : { defaultValue: values[k] ?? def });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div><label className="label" htmlFor={`${idPrefix}-makkahHotelId`}>فندق مكة (يحدد السعر)</label>
        <select id={`${idPrefix}-makkahHotelId`} name={"makkahHotelId" + nameSuffix} className="input" {...pick("makkahHotelId", "")}>
          <option value="">— اختر —</option>{mk.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select></div>
      <div><label className="label" htmlFor={`${idPrefix}-housing`}>السكن</label>
        <select id={`${idPrefix}-housing`} name={"housing" + nameSuffix} className="input" {...pick("housing", "")}>
          <option value="">مع سكن (حسب نوع الغرفة)</option><option value="NO">بدون سكن</option>
        </select></div>
      <div><label className="label" htmlFor={`${idPrefix}-food`}>الطعام</label>
        <select id={`${idPrefix}-food`} name={"food" + nameSuffix} className="input" {...pick("food", "1")}>
          <option value="1">مع طعام</option><option value="0">بدون طعام</option>
        </select></div>
      {air && <div><label className="label" htmlFor={`${idPrefix}-sarf`}>التصريف</label>
        <select id={`${idPrefix}-sarf`} name={"sarf" + nameSuffix} className="input" {...pick("sarf", "COMPANY")}>
          <option value="COMPANY">تصريف الشركة</option><option value="PILGRIM">تصريف المعتمر (يُضاف إلى السعر)</option>
        </select></div>}
      <div><label className="label" htmlFor={`${idPrefix}-tripRole`}>الدور في الباص (لكل باص واحد فقط)</label>
        <select id={`${idPrefix}-tripRole`} name={"tripRole" + nameSuffix} className="input" {...(onChange ? { value: values.tripRole ?? "", onChange: set("tripRole") } : { defaultValue: values.tripRole ?? "" })}>
          <option value="">— لا شيء —</option><option value="CONTRACTOR">متعهد</option><option value="DRIVER">سايق</option><option value="ASSISTANT">مساعد سايق</option>
        </select></div>

      <div><label className="label" htmlFor={`${idPrefix}-roomType`}>نوع الغرفة</label>
        <select id={`${idPrefix}-roomType`} name={"roomType" + nameSuffix} className="input" {...(onChange ? { value: values.roomType, onChange: set("roomType") } : { defaultValue: values.roomType })}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      {preview && <p role="status" className={"sm:col-span-2 rounded-lg border px-3 py-2 text-sm font-bold " + (preview.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>{preview.text}</p>}
    </div>
  );
}

/** Inline editor for an existing booking (trip page row). */
export function AccommodationEditor({ action, hotels, values, summary, priced, air, tables, sarfAmount }: { priced?: PricedHotel[]; air?: boolean; tables?: PriceTables; sarfAmount?: number | null; action: (p: TripActionState, f: FormData) => Promise<TripActionState>; hotels: HotelOpt[]; values: AccValues; summary: React.ReactNode }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  const pop = usePopover(st.ok ? st : null);
  return (
    <div className="text-sm">
      <div>{summary || <span className="text-brand-mid">غير مسكّن</span>}</div>
      <details ref={pop} className="relative mt-1">
        <summary className="btn-ghost btn-sm inline-flex cursor-pointer list-none">تعديل التسكين</summary>
        <form action={fa} className="absolute end-0 z-30 mt-1 w-80 max-w-[85vw] space-y-3 rounded-xl border border-line bg-white p-3 shadow-xl">
          <AccommodationFields hotels={hotels} priced={priced} air={air} tables={tables} sarfAmount={sarfAmount} values={values} idPrefix={"e" + values.roomType + values.makkahRoomNo + values.madinahRoomNo} />
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" disabled={pending}>حفظ التسكين</button>
            {st.error && <p role="alert" className="text-xs font-bold text-red-700">{st.error}</p>}
            {st.ok && <p role="status" className="text-xs font-bold text-emerald-800">تم الحفظ</p>}
          </div>
        </form>
      </details>
    </div>
  );
}
