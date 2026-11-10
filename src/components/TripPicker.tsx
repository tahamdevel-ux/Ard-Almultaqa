"use client";
import { useActionState, useState } from "react";
import { AccommodationFields, type HotelOpt } from "@/components/AccommodationFields";

export type TripChoice = { id: string; label: string; dates: string; booked?: boolean; makkahHotelId?: string; madinahHotelId?: string; priced?: { id: string; name: string }[]; air?: boolean; heads?: { bookingId: string; name: string }[] };

/** Multi-select of trips as checkboxes (name="tripIds"). */
export function TripPicker({ trips, error, hotels, initial, onHeadChange }: { trips: TripChoice[]; error?: string; hotels?: HotelOpt[]; initial?: Record<string, string | string[]>; onHeadChange?: (any: boolean) => void }) {
  const [headTrips, setHeadTrips] = useState<Set<string>>(new Set(Object.keys(initial ?? {}).filter((k) => k.startsWith("isHead__") && initial?.[k] === "on").map((k) => k.slice(8))));
  const [q, setQ] = useState("");
  const first = initial?.tripIds;
  const [checked, setChecked] = useState<Set<string>>(new Set(Array.isArray(first) ? first : first ? [first] : []));
  const shown = trips.filter((t) => !q || (t.label + " " + t.dates).includes(q));
  return (
    <fieldset className="space-y-2">
      {trips.length > 6 && <input className="input" placeholder="ابحث في الرحلات" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الرحلات" />}
      <div className="max-h-[32rem] space-y-1 overflow-auto rounded border border-line p-2">
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
                <p className="text-xs font-bold text-brand-mid">التسكين في هذه الرحلة (اختياري): فندق مكة ونوع الغرفة والطعام</p>
                <div className="flex flex-wrap items-end gap-3 border-b border-line pb-2">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" name={"isHead__" + t.id} defaultChecked={headTrips.has(t.id)}
                      onChange={(e) => setHeadTrips((h) => { const n = new Set(h); if (e.target.checked) n.add(t.id); else n.delete(t.id); onHeadChange?.(n.size > 0); return n; })} />
                    رب الأسرة
                  </label>
                  <div><label className="label" htmlFor={"headOf-" + t.id}>تابع لرب أسرة</label>
                    <select id={"headOf-" + t.id} name={"headOf__" + t.id} className="input w-64" defaultValue={(initial?.["headOf__" + t.id] as string) ?? ""}>
                      <option value="">— لا —</option>{(t.heads ?? []).map((h) => <option key={h.bookingId} value={h.bookingId}>{h.name}</option>)}
                    </select></div>
                </div>
                <AccommodationFields hotels={hotels} priced={t.priced} air={t.air} idPrefix={"p" + t.id} nameSuffix={"__" + t.id}
                  values={{ makkahHotelId: (initial?.["makkahHotelId__" + t.id] as string) ?? t.makkahHotelId ?? "", madinahHotelId: "", roomType: (initial?.["roomType__" + t.id] as string) ?? "", makkahRoomNo: "", madinahRoomNo: "", housing: (initial?.["housing__" + t.id] as string) ?? "", food: (initial?.["food__" + t.id] as string) ?? "1", sarf: (initial?.["sarf__" + t.id] as string) ?? "COMPANY", officeRoom: (initial?.["officeRoom__" + t.id] as string) ?? "" }} />
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-brand-mid">لا توجد رحلات</p>}
      </div>
      {hotels && checked.size === 0 && <p className="rounded bg-canvas px-2 py-1 text-xs text-brand-mid">💡 علّم على الرحلة (المربع بجانب اسمها) وسيظهر تحتها: فندق مكة ونوع الغرفة.</p>}
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
