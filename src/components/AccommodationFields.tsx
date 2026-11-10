"use client";
import { useActionState } from "react";
import type { TripActionState } from "@/app/(app)/trips/actions";

export type HotelOpt = { id: string; name: string; city: "MAKKAH" | "MADINAH" };
export type AccValues = { makkahHotelId: string; madinahHotelId: string; roomType: string; makkahRoomNo: string; madinahRoomNo: string; officeRoom?: string; tripRole?: string; housing?: string; food?: string; sarf?: string };
export type PricedHotel = { id: string; name: string };
const TYPES = [["", "—"], ["SINGLE", "سنكل"], ["DOUBLE", "ثنائية"], ["TRIPLE", "ثلاثية"], ["QUAD", "رباعية"], ["QUINT", "خماسية"]];

/** Hotel per city, room type and room numbers for one pilgrim. Names match accommodationFromForm(). */
export function AccommodationFields({ hotels, values, onChange, idPrefix = "acc", nameSuffix = "", priced, air }: { hotels: HotelOpt[]; priced?: PricedHotel[]; air?: boolean; values: AccValues; onChange?: (v: AccValues) => void; idPrefix?: string; nameSuffix?: string }) {
  const set = (k: keyof AccValues) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => onChange?.({ ...values, [k]: e.target.value });
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
      <div className="sm:col-span-2"><label className="label" htmlFor={`${idPrefix}-officeRoom`}>غرفة المكتب الداخلية (اختياري — اتركها فارغة للتوزيع التلقائي)</label>
        <input id={`${idPrefix}-officeRoom`} name={"officeRoom" + nameSuffix} className="input" dir="ltr" placeholder="مثلاً 1 أو a3 — كل من تكتب له نفس الرقم يُجمَعون في غرفة واحدة" {...(onChange ? { value: values.officeRoom ?? "", onChange: set("officeRoom") } : { defaultValue: values.officeRoom ?? "" })} /></div>
      <div><label className="label" htmlFor={`${idPrefix}-roomType`}>نوع الغرفة</label>
        <select id={`${idPrefix}-roomType`} name={"roomType" + nameSuffix} className="input" {...(onChange ? { value: values.roomType, onChange: set("roomType") } : { defaultValue: values.roomType })}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
    </div>
  );
}

/** Inline editor for an existing booking (trip page row). */
export function AccommodationEditor({ action, hotels, values, summary, priced, air }: { priced?: PricedHotel[]; air?: boolean; action: (p: TripActionState, f: FormData) => Promise<TripActionState>; hotels: HotelOpt[]; values: AccValues; summary: string }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">{summary || <span className="text-brand-mid">غير مسكّن</span>} <span className="text-xs underline">تعديل</span></summary>
      <form action={fa} className="mt-2 w-72 space-y-2 rounded border border-line p-2">
        <AccommodationFields hotels={hotels} priced={priced} air={air} values={values} idPrefix={"e" + values.roomType + values.makkahRoomNo + values.madinahRoomNo} />
        <button className="btn py-1" disabled={pending}>حفظ التسكين</button>
        {st.error && <p role="alert" className="text-xs font-bold text-red-700">{st.error}</p>}
        {st.ok && <p role="status" className="text-xs font-bold text-emerald-800">تم</p>}
      </form>
    </details>
  );
}
