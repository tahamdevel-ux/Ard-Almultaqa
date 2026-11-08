"use client";
import { useActionState } from "react";
import type { TripActionState } from "@/app/(app)/trips/actions";

export type HotelOpt = { id: string; name: string; city: "MAKKAH" | "MADINAH" };
export type AccValues = { makkahHotelId: string; madinahHotelId: string; roomType: string; makkahRoomNo: string; madinahRoomNo: string };
const TYPES = [["", "—"], ["DOUBLE", "ثنائية"], ["TRIPLE", "ثلاثية"], ["QUAD", "رباعية"], ["QUINT", "خماسية"]];

/** Hotel per city, room type and room numbers for one pilgrim. Names match accommodationFromForm(). */
export function AccommodationFields({ hotels, values, onChange, idPrefix = "acc" }: { hotels: HotelOpt[]; values: AccValues; onChange?: (v: AccValues) => void; idPrefix?: string }) {
  const set = (k: keyof AccValues) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => onChange?.({ ...values, [k]: e.target.value });
  const sel = (k: "makkahHotelId" | "madinahHotelId", city: "MAKKAH" | "MADINAH", label: string) => (
    <div><label className="label" htmlFor={`${idPrefix}-${k}`}>{label}</label>
      <select id={`${idPrefix}-${k}`} name={k} className="input" {...(onChange ? { value: values[k], onChange: set(k) } : { defaultValue: values[k] })}>
        <option value="">— فندق الرحلة —</option>{hotels.filter((h) => h.city === city).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select></div>
  );
  const room = (k: "makkahRoomNo" | "madinahRoomNo", label: string) => (
    <div><label className="label" htmlFor={`${idPrefix}-${k}`}>{label}</label>
      <input id={`${idPrefix}-${k}`} name={k} className="input" dir="ltr" {...(onChange ? { value: values[k], onChange: set(k) } : { defaultValue: values[k] })} /></div>
  );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {sel("makkahHotelId", "MAKKAH", "فندق مكة")}
      {room("makkahRoomNo", "رقم غرفة مكة")}
      {sel("madinahHotelId", "MADINAH", "فندق المدينة")}
      {room("madinahRoomNo", "رقم غرفة المدينة")}
      <div><label className="label" htmlFor={`${idPrefix}-roomType`}>نوع الغرفة</label>
        <select id={`${idPrefix}-roomType`} name="roomType" className="input" {...(onChange ? { value: values.roomType, onChange: set("roomType") } : { defaultValue: values.roomType })}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
    </div>
  );
}

/** Inline editor for an existing booking (trip page row). */
export function AccommodationEditor({ action, hotels, values, summary }: { action: (p: TripActionState, f: FormData) => Promise<TripActionState>; hotels: HotelOpt[]; values: AccValues; summary: string }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">{summary || <span className="text-brand-mid">غير مسكّن</span>} <span className="text-xs underline">تعديل</span></summary>
      <form action={fa} className="mt-2 w-72 space-y-2 rounded border border-line p-2">
        <AccommodationFields hotels={hotels} values={values} idPrefix={"e" + values.roomType + values.makkahRoomNo + values.madinahRoomNo} />
        <button className="btn py-1" disabled={pending}>حفظ التسكين</button>
        {st.error && <p role="alert" className="text-xs font-bold text-red-700">{st.error}</p>}
        {st.ok && <p role="status" className="text-xs font-bold text-emerald-800">تم</p>}
      </form>
    </details>
  );
}
