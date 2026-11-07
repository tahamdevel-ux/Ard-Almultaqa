"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExistingPilgrim } from "@/app/(app)/trips/actions";

type Hit = { id: string; name: string; sub: string; inThis: boolean; trips: { id: string; label: string; dates: string; past: boolean }[] };

export function AddPilgrimDialog({ tripId }: { tripId: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/trips/${tripId}/candidates?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (r.ok) setHits((await r.json()).results);
      } catch { /* aborted */ }
    }, 250);
    return () => { clearTimeout(h); ctl.abort(); };
  }, [q, tripId]);

  function add(h: Hit) {
    start(async () => {
      const r = await addExistingPilgrim(tripId, h.id);
      if (r.ok) {
        setMsg({ ok: true, text: `أُضيف ${h.name}` + (r.warning ? ` — ⚠ ${r.warning}` : "") });
        setHits((x) => x.map((y) => (y.id === h.id ? { ...y, inThis: true } : y)));
        router.refresh();
      } else setMsg({ text: r.error ?? "تعذّرت الإضافة" });
    });
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => { setMsg(null); dlg.current?.showModal(); }}>إضافة معتمر</button>
      <dialog ref={dlg} className="w-[min(94vw,32rem)] rounded-xl border border-line p-0 shadow-2xl backdrop:bg-black/40" aria-label="إضافة معتمر للرحلة">
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">إضافة معتمر لهذه الرحلة</h2>
            <button type="button" className="text-sm underline" onClick={() => dlg.current?.close()}>إغلاق</button>
          </div>
          <input autoFocus className="input" value={q} onChange={(e) => { setQ(e.target.value); setMsg(null); }} placeholder="ابحث بالاسم أو رقم الجواز أو الهاتف" aria-label="بحث عن معتمر" />
          {msg && <p role="status" className={msg.ok ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" : "alert-bad"}>{msg.text}</p>}
          <ul className="max-h-80 space-y-2 overflow-auto">
            {hits.map((h) => (
              <li key={h.id} className="rounded border border-line p-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold">{h.name}</div>
                    <div className="ltr text-xs text-brand-mid">{h.sub}</div>
                  </div>
                  {h.inThis ? <span className="chip chip-ok">مضاف</span> : <button type="button" className="btn" disabled={pending} onClick={() => add(h)}>إضافة</button>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {h.trips.map((t) => <span key={t.id} className={"chip " + (t.past ? "" : "chip-ok")}>{t.label} · {t.dates}{t.past ? " · سافر سابقاً" : ""}</span>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
