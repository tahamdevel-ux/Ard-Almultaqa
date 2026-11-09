"use client";
import { useState, useTransition } from "react";
import { moveMember, newRoom, removeRoom, renumber, rerun, toggleLock, type OfficeActionState } from "@/app/(app)/trips/[id]/office-rooms/actions";

export interface BoardPerson { bookingId: string; name: string; gender: "MALE" | "FEMALE"; group?: string; manual?: boolean; warning?: string | null; locked: boolean }
export interface BoardCard { id: string; label: string; typeLabel: string; category: "MEN" | "WOMEN" | "FAMILY"; capacity: number; locked: boolean; people: BoardPerson[] }

const CAT = {
  MEN: { label: "رجال", bg: "#DCE8F6", fg: "#1F4E8C" },
  WOMEN: { label: "نساء", bg: "#ECE4F7", fg: "#5B3F8F" },
  FAMILY: { label: "عائلة", bg: "#E2F1E5", fg: "#2E6B3F" },
} as const;
const EMPTY = { bg: "#FFF3D1", fg: "#8A6400" };

/** Office room cards: drag a pilgrim between rooms (MANUAL), lock a room, re-run the automatic assignment. Internal use only. */
export function OfficeBoard({ tripId, cards, pool, canEdit, isAdmin }: { tripId: string; cards: BoardCard[]; pool: BoardPerson[]; canEdit: boolean; isAdmin: boolean }) {
  const [msg, setMsg] = useState<OfficeActionState | null>(null);
  const [pending, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [type, setType] = useState("");
  const run = (fn: () => Promise<OfficeActionState>) => start(async () => setMsg(await fn()));
  const drop = (roomId: string | null) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) run(() => moveMember(tripId, id, roomId));
  };

  return (
    <div className="space-y-3" aria-busy={pending}>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => rerun(tripId))}>أعد التوزيع</button>
          <select aria-label="نوع الغرفة الجديدة" className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">بسعة افتراضية</option><option value="SINGLE">سنكل</option><option value="DOUBLE">ثنائية</option><option value="TRIPLE">ثلاثية</option><option value="QUAD">رباعية</option><option value="QUINT">خماسية</option>
          </select>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => newRoom(tripId, type))}>غرفة جديدة</button>
          {isAdmin && (
            <button type="button" className="btn-secondary" disabled={pending}
              onClick={() => { if (window.confirm("إعادة ترقيم الغرف داخل هذه الرحلة بلا فجوات؟ ستتغير أرقام بعض الغرف.")) run(() => renumber(tripId)); }}>إعادة ترقيم</button>
          )}
          <span className="text-xs text-brand-mid">«أعد التوزيع» لا يمس الغرف المقفلة ولا من نُقل يدوياً.</span>
        </div>
      )}
      {msg?.error && <p role="alert" className="alert-bad">{msg.error}</p>}
      {msg?.info && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{msg.info}</p>}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className={"card space-y-1 " + (over === "pool" ? "ring-2 ring-brand" : "")} onDragOver={(e) => { e.preventDefault(); setOver("pool"); }} onDragLeave={() => setOver(null)} onDrop={drop(null)}>
          <h3 className="font-bold">بدون غرفة ({pool.length})</h3>
          {pool.map((p) => (
            <div key={p.bookingId} className="space-y-0.5">
              <div draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.bookingId)} className="rounded border border-line bg-white px-1.5 py-1 text-xs">{p.name}</div>
              {canEdit && (
                <select aria-label={`نقل ${p.name} إلى غرفة`} className="w-full rounded border text-xs" value="" onChange={(e) => e.target.value && run(() => moveMember(tripId, p.bookingId, e.target.value))}>
                  <option value="">نقل إلى غرفة…</option>
                  {cards.filter((c) => !c.locked && c.people.length < c.capacity).map((c) => <option key={c.id} value={c.id}>{c.label} ({c.capacity - c.people.length} شاغر)</option>)}
                </select>
              )}
            </div>
          ))}
          {pool.length === 0 && <p className="text-xs text-brand-mid">الكل في غرفة ✓</p>}
        </aside>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const cat = CAT[c.category];
            const empty = Math.max(0, c.capacity - c.people.length);
            const warns = c.people.filter((p) => p.warning).length;
            return (
              <div key={c.id} data-room={c.label} onDragOver={(e) => { e.preventDefault(); setOver(c.id); }} onDragLeave={() => setOver(null)} onDrop={drop(c.id)}
                className={"overflow-hidden rounded-lg border-2 bg-white " + (over === c.id ? "ring-2 ring-brand" : "")} style={{ borderColor: cat.fg }}>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ background: cat.bg, color: cat.fg }}>
                  <span className="text-lg font-bold" dir="ltr">{c.label}</span>
                  <span className="text-xs font-bold">{c.typeLabel} · {cat.label}</span>
                  {canEdit && <button type="button" aria-label={c.locked ? "فتح القفل" : "قفل الغرفة"} title={c.locked ? "مقفلة" : "قفل"} className="text-base" onClick={() => run(() => toggleLock(tripId, c.id))}>{c.locked ? "🔒" : "🔓"}</button>}
                </div>
                <div className="space-y-1 p-2">
                  {c.people.map((p, i) => (
                    <div key={p.bookingId} draggable={canEdit && !c.locked} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.bookingId)}
                      className={"flex items-center gap-1 rounded border px-1.5 py-1 text-xs " + (p.warning ? "border-red-400 bg-red-50" : "border-line")}>
                      <span>{i + 1}.</span><span className="flex-1">{p.name}</span>
                      {p.group && <span className="rounded bg-brand-light px-1">{p.group}</span>}
                      {p.manual && <span title="نُقل يدوياً" aria-label="يدوي">✋</span>}
                      {canEdit && !c.locked && <button type="button" aria-label="إخراج من الغرفة" className="text-red-700" onClick={() => run(() => moveMember(tripId, p.bookingId, null))}>×</button>}
                      {p.warning && <span className="font-bold text-red-700" role="note">⚠</span>}
                    </div>
                  ))}
                  {Array.from({ length: empty }, (_, i) => <div key={"e" + i} className="rounded border px-1.5 py-1 text-xs" style={{ background: EMPTY.bg, color: EMPTY.fg, borderColor: EMPTY.fg + "55" }}>— فارغ —</div>)}
                  {warns > 0 && <p className="text-xs font-bold text-red-700">⚠ الغرفة لا تناسب المعتمر ({warns})</p>}
                  {canEdit && c.people.length === 0 && <button type="button" className="text-xs text-red-700 underline" onClick={() => run(() => removeRoom(tripId, c.id))}>حذف الغرفة الفارغة</button>}
                </div>
              </div>
            );
          })}
          {cards.length === 0 && <p className="text-sm text-brand-mid">لا توجد غرف بعد — تُنشأ تلقائياً عند إضافة المعتمرين.</p>}
        </div>
      </div>
    </div>
  );
}
