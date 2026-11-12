"use client";
import { useActionState, useState, useTransition } from "react";
import { deleteBus, moveToBus, type TripActionState } from "@/app/(app)/trips/actions";

export function DeleteBusButton({ tripId, busId }: { tripId: string; busId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <button type="button" className="text-xs text-red-700 underline" disabled={pending}
        onClick={() => { if (!window.confirm("حذف هذا الباص؟")) return; start(async () => { const r = await deleteBus(tripId, busId); setErr(r.error ?? null); }); }}>حذف الباص</button>
      {err && <span role="alert" className="ms-2 text-xs font-bold text-red-700">{err}</span>}
    </span>
  );
}

export type SeatedRow = { bookingId: string; name: string; seatNo: number | null; busLabel: string | null };

/** Select one or more pilgrims and move them (with their groups) to another bus. */
export function MoveToBusForm({ tripId, rows, buses }: { tripId: string; rows: SeatedRow[]; buses: { id: string; label: string; free: number }[] }) {
  const [state, action, pending] = useActionState(moveToBus.bind(null, tripId), {} as TripActionState);
  return (
    <form action={action} className="space-y-2">
      <div className="max-h-60 space-y-1 overflow-auto rounded border border-line p-2">
        {rows.map((r) => (
          <label key={r.bookingId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="bookingIds" value={r.bookingId} />
            <span>{r.name}</span>
            <span className="text-xs text-brand-mid">{r.busLabel ? `${r.busLabel} / ${r.seatNo}` : "بدون مقعد"}</span>
          </label>
        ))}
        {rows.length === 0 && <p className="text-sm text-brand-mid">لا يوجد معتمرون</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="targetBusId">نقل إلى</label>
          <select id="targetBusId" name="targetBusId" className="input w-56" defaultValue="">
            <option value="" disabled>اختر الباص</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.label} (شاغر {b.free})</option>)}
          </select>
        </div>
        <button className="btn" disabled={pending}>{pending ? "جارٍ النقل…" : "نقل المحددين"}</button>
      </div>
      {state.error && <p role="alert" className="alert-bad">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm font-bold text-emerald-800">تم النقل</p>}
    </form>
  );
}
