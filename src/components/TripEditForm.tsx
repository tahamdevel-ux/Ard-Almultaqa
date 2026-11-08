"use client";
import { useActionState } from "react";
import { DateInput } from "@/components/DateInput";
import { updateTrip, type TripActionState } from "@/app/(app)/trips/actions";

type Init = { tripNo: string; name: string; departDate: string; returnDate: string; capacity: string; supervisorId: string; status: string; nightsMakkah: string; nightsMadinah: string };

export function TripEditForm({ tripId, initial, supervisors, statuses }: { tripId: string; initial: Init; supervisors: { id: string; name: string }[]; statuses: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(updateTrip.bind(null, tripId), {} as TripActionState);
  return (
    <form action={action} className="card grid gap-3 sm:grid-cols-3">
      <div><label className="label" htmlFor="e-tripNo">رقم الرحلة</label><input id="e-tripNo" name="tripNo" defaultValue={initial.tripNo} className="input" dir="ltr" /></div>
      <div><label className="label" htmlFor="e-name">اسم البرنامج *</label><input id="e-name" name="name" defaultValue={initial.name} className="input" required /></div>
      <div><label className="label" htmlFor="e-status">الحالة</label><select id="e-status" name="status" defaultValue={initial.status} className="input">{statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
      <div><label className="label" htmlFor="e-depart">تاريخ الذهاب</label><DateInput id="e-depart" name="departDate" defaultValue={initial.departDate} className="input" /></div>
      <div><label className="label" htmlFor="e-return">تاريخ العودة</label><DateInput id="e-return" name="returnDate" defaultValue={initial.returnDate} className="input" /></div>
      <div><label className="label" htmlFor="e-cap">السعة القصوى</label><input id="e-cap" name="capacity" type="number" min={0} defaultValue={initial.capacity} className="input" dir="ltr" /></div>
      <div><label className="label" htmlFor="e-nm">ليالي مكة</label><input id="e-nm" name="nightsMakkah" type="number" min={0} defaultValue={initial.nightsMakkah} className="input" dir="ltr" /></div>
      <div><label className="label" htmlFor="e-nd">ليالي المدينة</label><input id="e-nd" name="nightsMadinah" type="number" min={0} defaultValue={initial.nightsMadinah} className="input" dir="ltr" /></div>
      <div><label className="label" htmlFor="e-sup">المشرف</label><select id="e-sup" name="supervisorId" defaultValue={initial.supervisorId} className="input"><option value="">—</option>{supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}</button>
        {state.error && <span role="alert" className="text-sm font-bold text-red-700">{state.error}</span>}
        {state.ok && <span role="status" className="text-sm font-bold text-emerald-800">تم الحفظ</span>}
      </div>
    </form>
  );
}
