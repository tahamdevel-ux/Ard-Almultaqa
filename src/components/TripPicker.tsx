"use client";
import { useActionState, useState } from "react";
import { AccommodationFields, type HotelOpt } from "@/components/AccommodationFields";

export type TripChoice = { id: string; label: string; dates: string; booked?: boolean; makkahHotelId?: string; madinahHotelId?: string };

/** Multi-select of trips as checkboxes (name="tripIds"). */
export function TripPicker({ trips, error, hotels, initial }: { trips: TripChoice[]; error?: string; hotels?: HotelOpt[]; initial?: Record<string, string | string[]> }) {
  const [q, setQ] = useState("");
  const first = initial?.tripIds;
  const [checked, setChecked] = useState<Set<string>>(new Set(Array.isArray(first) ? first : first ? [first] : []));
  const shown = trips.filter((t) => !q || (t.label + " " + t.dates).includes(q));
  return (
    <fieldset className="space-y-2">
      {trips.length > 6 && <input className="input" placeholder="ابحث في الرحلات" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الرحلات" />}
      <div className="max-h-56 space-y-1 overflow-auto rounded border border-line p-2">
        {shown.map((t) => (
          <div key={t.id}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="tripIds" value={t.id} disabled={t.booked} defaultChecked={checked.has(t.id)}
                onChange={(e) => setChecked((c) => { const n = new Set(c); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
              <span className="font-bold">{t.label}</span>
              <span className="ltr text-xs text-brand-mid">{t.dates}</span>
              {t.booked && <span className="chip chip-ok">مضاف</span>}
            </label>
            {hotels && checked.has(t.id) && !t.booked && (
              <div className="my-2 space-y-1 rounded bg-canvas p-2">
                <p className="text-xs font-bold text-brand-mid">التسكين في هذه الرحلة (اختياري): فندق كل مدينة ونوع الغرفة ورقمها</p>
                <AccommodationFields hotels={hotels} idPrefix={"p" + t.id} nameSuffix={"__" + t.id}
                  values={{ makkahHotelId: (initial?.["makkahHotelId__" + t.id] as string) ?? t.makkahHotelId ?? "", madinahHotelId: (initial?.["madinahHotelId__" + t.id] as string) ?? t.madinahHotelId ?? "", roomType: (initial?.["roomType__" + t.id] as string) ?? "", makkahRoomNo: (initial?.["makkahRoomNo__" + t.id] as string) ?? "", madinahRoomNo: (initial?.["madinahRoomNo__" + t.id] as string) ?? "" }} />
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-brand-mid">لا توجد رحلات</p>}
      </div>
      {hotels && checked.size === 0 && <p className="rounded bg-canvas px-2 py-1 text-xs text-brand-mid">💡 علّم على الرحلة (المربع بجانب اسمها) وسيظهر تحتها: فندق مكة وفندق المدينة ونوع الغرفة ورقمها.</p>}
      {error && <p className="text-xs font-bold text-red-700" role="alert">{error}</p>}
    </fieldset>
  );
}

export function AddToTripsForm({ action, trips, hotels }: { hotels?: HotelOpt[]; action: (p: { error?: string; message?: string }, f: FormData) => Promise<{ error?: string; message?: string }>; trips: TripChoice[] }) {
  const [state, formAction, pending] = useActionState(action, {} as { error?: string; message?: string });
  return (
    <form action={formAction} className="space-y-2">
      <TripPicker trips={trips} hotels={hotels} />
      <button className="btn" disabled={pending}>{pending ? "جارٍ الإضافة…" : "إضافة للرحلات المحددة"}</button>
      {state.error && <p className="alert-bad">{state.error}</p>}
      {state.message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{state.message}</p>}
    </form>
  );
}
