"use client";
import { useActionState, useEffect, useState } from "react";
import type { TripActionState } from "@/app/(app)/trips/actions";
import { MODE_LABELS, TRANSPORT_MODES, type TransportMode } from "@/domain/transport";

type Act = (p: TripActionState, f: FormData) => Promise<TripActionState>;
const ROOM_TYPES: [string, string][] = [["SINGLE", "سنكل"], ["DOUBLE", "ثنائية"], ["TRIPLE", "ثلاثية"], ["QUAD", "رباعية"], ["QUINT", "خماسية"]];
const boxes = () => [...document.querySelectorAll<HTMLInputElement>("input[name=bookingIds]")];

/** Header checkbox: ticks / unticks every pilgrim currently shown. */
export function SelectAllBox() {
  return (
    <input type="checkbox" aria-label="تحديد كل المعتمرين الظاهرين" className="h-4 w-4"
      onChange={(e) => { const on = e.target.checked; for (const b of boxes()) if (b.checked !== on) { b.checked = on; b.dispatchEvent(new Event("change", { bubbles: true })); } }} />
  );
}

function Panel({ title, action, ids, children, onDone }: { title: string; action: Act; ids: string[]; children: React.ReactNode; onDone: () => void }) {
  const [st, fa, pending] = useActionState(action, {} as TripActionState);
  useEffect(() => { if (st.ok) onDone(); }, [st, onDone]);
  return (
    <form action={fa} className="absolute inset-x-0 bottom-full mb-2 space-y-3 rounded-2xl border border-line bg-white p-4 shadow-2xl">
      <input type="hidden" name="ids" value={JSON.stringify(ids)} />
      <div className="font-bold">{title} <span className="font-normal text-brand-mid">({ids.length} معتمر)</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending}>{pending ? "جارٍ الحفظ…" : "تطبيق على المحددين"}</button>
        {st.error && <span role="alert" className="text-sm font-bold text-red-700">{st.error}</span>}
        {st.warning && <span role="status" className="text-sm font-bold text-emerald-800">{st.warning}</span>}
      </div>
    </form>
  );
}

/**
 * Appears when pilgrims are ticked in the trip list: group them as a family or companions, set their hotel / room type / food at once,
 * or set how they travel. Everything applies to all ticked pilgrims or to none.
 */
export function TripBulkBar({ canGroup, accAction, trAction, priced, air, cars, flights }: {
  canGroup: boolean; accAction?: Act; trAction?: Act; priced: { id: string; name: string }[]; air: boolean; cars: { id: string; label: string }[]; flights: { id: string; label: string }[];
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState<"" | "acc" | "tr">("");
  const [mode, setMode] = useState<TransportMode>("BUS");
  useEffect(() => {
    const sync = () => setIds(boxes().filter((b) => b.checked).map((b) => b.value));
    const on = (e: Event) => { if ((e.target as HTMLElement)?.getAttribute?.("name") === "bookingIds") sync(); };
    document.addEventListener("change", on);
    sync();
    return () => document.removeEventListener("change", on);
  }, []);
  if (!ids.length) return null;
  const clear = () => { for (const b of boxes()) if (b.checked) { b.checked = false; b.dispatchEvent(new Event("change", { bubbles: true })); } setOpen(""); };
  const close = () => { setOpen(""); };
  return (
    <div role="region" aria-label="إجراءات على المحددين" className="fixed inset-x-0 bottom-16 z-40 mx-auto w-[min(64rem,calc(100%-1rem))] md:bottom-4">
      <div className="relative flex flex-wrap items-center gap-2 rounded-2xl border border-brand bg-white p-3 shadow-2xl">
        {open === "acc" && accAction && (
          <Panel title="تعيين الإقامة" action={accAction} ids={ids} onDone={close}>
            <div><label className="label" htmlFor="b-hotel">فندق مكة</label>
              <select id="b-hotel" name="makkahHotelId" className="input" defaultValue="__keep"><option value="__keep">— بلا تغيير —</option>{priced.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
            <div><label className="label" htmlFor="b-type">نوع الغرفة</label>
              <select id="b-type" name="roomType" className="input" defaultValue="__keep"><option value="__keep">— بلا تغيير —</option>{ROOM_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label" htmlFor="b-housing">السكن</label>
              <select id="b-housing" name="housing" className="input" defaultValue="__keep"><option value="__keep">— بلا تغيير —</option><option value="WITH">مع سكن</option><option value="NO">بدون سكن</option></select></div>
            <div><label className="label" htmlFor="b-food">الطعام</label>
              <select id="b-food" name="food" className="input" defaultValue="__keep"><option value="__keep">— بلا تغيير —</option><option value="1">مع طعام</option><option value="0">بدون طعام</option></select></div>
            {air && <div><label className="label" htmlFor="b-sarf">التصريف</label>
              <select id="b-sarf" name="sarf" className="input" defaultValue="__keep"><option value="__keep">— بلا تغيير —</option><option value="COMPANY">تصريف الشركة</option><option value="PILGRIM">تصريف المعتمر</option></select></div>}
          </Panel>
        )}
        {open === "tr" && trAction && (
          <Panel title="تعيين وسيلة النقل" action={trAction} ids={ids} onDone={close}>
            <div><label className="label" htmlFor="b-mode">الوسيلة</label>
              <select id="b-mode" name="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as TransportMode)}>{TRANSPORT_MODES.map((k) => <option key={k} value={k}>{MODE_LABELS[k]}</option>)}</select></div>
            {mode === "CAR" && <div><label className="label" htmlFor="b-car">السيارة</label>
              <select id="b-car" name="carId" className="input" required><option value="">{cars.length ? "اختر السيارة" : "لا سيارات — أضف سيارة"}</option>{cars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>}
            {mode === "FLIGHT" && flights.length > 0 && <div><label className="label" htmlFor="b-flight">الرحلة الجوية</label>
              <select id="b-flight" name="flightId" className="input"><option value="">— غير محددة —</option>{flights.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>}
          </Panel>
        )}
        <span className="font-bold">{ids.length} محدد</span>
        {canGroup && (
          <>
            <button form="groupform" name="kind" value="COMPANIONS" className="btn-secondary btn-sm" title="الجمع في غرفة واحدة تلقائياً">جمعهم كعصبة</button>
            <button form="groupform" name="kind" value="FAMILY" className="btn-secondary btn-sm" title="الأول في القائمة يصير رب الأسرة">جمعهم كعائلة</button>
          </>
        )}
        {accAction && <button type="button" className={open === "acc" ? "btn btn-sm" : "btn-secondary btn-sm"} aria-expanded={open === "acc"} onClick={() => setOpen(open === "acc" ? "" : "acc")}>تعيين الإقامة…</button>}
        {trAction && <button type="button" className={open === "tr" ? "btn btn-sm" : "btn-secondary btn-sm"} aria-expanded={open === "tr"} onClick={() => setOpen(open === "tr" ? "" : "tr")}>تعيين النقل…</button>}
        <button type="button" className="btn-ghost btn-sm ms-auto" onClick={clear}>إلغاء التحديد</button>
      </div>
    </div>
  );
}
