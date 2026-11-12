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
    <form action={fa} className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-1">
        <select name="mode" aria-label="وسيلة النقل" value={m} onChange={(e) => setM(e.target.value as TransportMode)} className="input w-28 py-1">
          {TRANSPORT_MODES.map((k) => <option key={k} value={k}>{MODE_LABELS[k]}</option>)}
        </select>
        {m === "CAR" && (
          <select name="carId" aria-label="السيارة" defaultValue={carId} className="input w-28 py-1" required>
            <option value="">{opts.cars.length ? "اختر السيارة" : "لا سيارات — أضف سيارة"}</option>
            {opts.cars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        {m === "FLIGHT" && opts.flights.length > 0 && (
          <select name="flightId" aria-label="الرحلة الجوية" defaultValue={flightId} className="input w-32 py-1">
            <option value="">— الرحلة الجوية —</option>
            {opts.flights.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        )}
        <button className="btn-secondary py-1" disabled={pending || (m === mode && m === "BUS")}>حفظ</button>
      </div>
      <div className="text-xs text-brand-mid">{summary}</div>
      {st.error && <span role="alert" className="text-xs font-bold text-red-700">{st.error}</span>}
    </form>
  );
}
