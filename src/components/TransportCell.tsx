"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import type { TripActionState } from "@/app/(app)/trips/actions";
import { MODE_LABELS, TRANSPORT_MODES, type TransportMode } from "@/domain/transport";

export interface TransportOpts {
  cars: { id: string; label: string }[];
  flights: { id: string; label: string }[];
  /** the pilgrim's seat text and bus page, when he is on a bus */
  seatText: string | null;
  busHref: string | null;
}

/** One pilgrim's transport: the mode (bus / car / flight) and the thing that goes with it (seat, car, flight). */
export function TransportCell({ action, mode, carId, flightId, opts, canEdit }: { action: (p: TripActionState, f: FormData) => Promise<TripActionState>; mode: TransportMode; carId: string; flightId: string; opts: TransportOpts; canEdit: boolean }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  const [m, setM] = useState<TransportMode>(mode);
  const car = opts.cars.find((c) => c.id === carId);
  const flight = opts.flights.find((f) => f.id === flightId);
  const summary = mode === "BUS" ? (opts.busHref && opts.seatText ? <Link className="underline" href={opts.busHref}>{opts.seatText}</Link> : <span className="chip chip-warn">بلا مقعد</span>)
    : mode === "CAR" ? (car ? `سيارة ${car.label}` : <span className="chip chip-warn">سيارة — لم تُحدَّد</span>)
    : (flight?.label ?? "رحلة جوية");
  if (!canEdit) return <span className="text-sm">{summary}</span>;
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-1.5"><span className="chip chip-gray">{MODE_LABELS[mode]}</span><span>{summary}</span></div>
      <details className="relative mt-1">
        <summary className="btn-ghost btn-sm inline-flex cursor-pointer list-none">تعديل النقل</summary>
        <form action={fa} className="absolute end-0 z-30 mt-1 w-72 max-w-[85vw] space-y-2 rounded-xl border border-line bg-white p-3 shadow-xl">
          <label className="label" htmlFor={"mode-" + (carId || flightId || mode)}>وسيلة النقل</label>
          <select id={"mode-" + (carId || flightId || mode)} name="mode" aria-label="وسيلة النقل" value={m} onChange={(e) => setM(e.target.value as TransportMode)} className="input">
            {TRANSPORT_MODES.map((k) => <option key={k} value={k}>{MODE_LABELS[k]}</option>)}
          </select>
          {m === "CAR" && (
            <select name="carId" aria-label="السيارة" defaultValue={carId} className="input" required>
              <option value="">{opts.cars.length ? "اختر السيارة" : "لا سيارات — أضف سيارة"}</option>
              {opts.cars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
          {m === "FLIGHT" && opts.flights.length > 0 && (
            <select name="flightId" aria-label="الرحلة الجوية" defaultValue={flightId} className="input">
              <option value="">— الرحلة الجوية —</option>
              {opts.flights.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" disabled={pending || (m === mode && m === "BUS")}>حفظ</button>
            {st.error && <span role="alert" className="text-xs font-bold text-red-700">{st.error}</span>}
            {st.ok && <span role="status" className="text-xs font-bold text-emerald-800">تم الحفظ</span>}
          </div>
        </form>
      </details>
    </div>
  );
}
