"use client";
import { useState, useTransition } from "react";
import { addRooms, autoAssign, clearCity, type RoomingResult } from "@/app/(app)/trips/[id]/rooming/actions";

export function RoomingControls({ tripId, city }: { tripId: string; city: "MAKKAH" | "MADINAH" }) {
  const [res, setRes] = useState<RoomingResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3">
      <form action={(f) => start(async () => setRes(await addRooms(tripId, city, f)))} className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="rc-type">نوع الغرفة</label>
          <select id="rc-type" name="type" className="input w-28"><option value="DOUBLE">ثنائية</option><option value="TRIPLE">ثلاثية</option><option value="QUAD">رباعية</option><option value="QUINT">خماسية</option></select></div>
        <div><label className="label" htmlFor="rc-count">العدد</label><input id="rc-count" name="count" type="number" defaultValue={1} min={1} className="input w-20" dir="ltr" /></div>
        <div><label className="label" htmlFor="rc-prefix">بادئة</label><input id="rc-prefix" name="prefix" className="input w-20" dir="ltr" placeholder="مثلاً 5" /></div>
        <div><label className="label" htmlFor="rc-start">يبدأ من رقم</label><input id="rc-start" name="start" type="number" defaultValue={1} min={1} className="input w-24" dir="ltr" /></div>
        <button className="btn-secondary" disabled={pending}>إضافة غرف</button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending} onClick={() => start(async () => setRes(await autoAssign(tripId, city)))}>تسكين تلقائي (اقتراح)</button>
        <button className="btn-secondary" disabled={pending} onClick={() => { if (confirm("إلغاء تسكين الجميع في هذه المدينة؟")) start(async () => setRes(await clearCity(tripId, city))); }}>إلغاء كل التسكين</button>
        <span className="text-xs text-brand-mid">بعد الاقتراح اسحب المعتمرين بين الغرف للتعديل.</span>
      </div>
      {res?.error && <p role="alert" className="text-sm font-bold text-red-700">{res.error}</p>}
      {res?.info && <p role="status" className="text-sm font-bold text-green-800">{res.info}</p>}
    </div>
  );
}
