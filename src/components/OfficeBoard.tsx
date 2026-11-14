"use client";
import { useMemo, useState, useTransition } from "react";
import { HeadTag } from "@/components/HeadTag";
import { filterRooms, personMatches, roomStatus, type RoomFilter } from "@/domain/roomFilter";
import { moveMember, moveMembers, newRoom, removeRoom, renumber, rerun, saveHotelNos, toggleLock, type OfficeActionState } from "@/app/(app)/trips/[id]/office-rooms/actions";

export interface BoardPerson { bookingId: string; name: string; passport: string; gender: "MALE" | "FEMALE"; group?: string; manual?: boolean; warning?: string | null; locked: boolean; head?: boolean; agent?: string; noHousing?: boolean; reason?: string }
export interface BoardCard { id: string; label: string; typeLabel: string; category: "MEN" | "WOMEN" | "FAMILY"; capacity: number; locked: boolean; hotel?: string; hotelId?: string | null; makkahNo?: string; madinahNo?: string; people: BoardPerson[] }

const CAT = {
  MEN: { label: "رجال", bg: "#DCE8F6", fg: "#1F4E8C" },
  WOMEN: { label: "نساء", bg: "#ECE4F7", fg: "#5B3F8F" },
  FAMILY: { label: "عائلة", bg: "#E2F1E5", fg: "#2E6B3F" },
} as const;
const EMPTY = { bg: "#FFF3D1", fg: "#8A6400" };
const housedOf = (c: BoardCard) => c.people.filter((p) => !p.noHousing).length;

/** The hotel's own room numbers of one room: saved by themselves when the field is left (no save button). */
function HotelNos({ tripId, room, canEdit, run }: { tripId: string; room: BoardCard; canEdit: boolean; run: (fn: () => Promise<OfficeActionState>) => void }) {
  const [mk, setMk] = useState(room.makkahNo ?? ""), [md, setMd] = useState(room.madinahNo ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = mk !== (room.makkahNo ?? "") || md !== (room.madinahNo ?? "");
  const save = () => { if (!dirty) return; run(async () => { const r = await saveHotelNos(tripId, room.id, mk, md); setSaved(!r.error); setTimeout(() => setSaved(false), 1500); return r; }); };
  if (!canEdit && !mk && !md) return null;
  return (
    <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
      <input aria-label={`غرفة مكة للغرفة ${room.label}`} placeholder="غرفة مكة" value={mk} disabled={!canEdit} onChange={(e) => setMk(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="input min-h-8 w-full py-1 text-xs" dir="ltr" />
      <input aria-label={`غرفة المدينة للغرفة ${room.label}`} placeholder="غرفة المدينة" value={md} disabled={!canEdit} onChange={(e) => setMd(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="input min-h-8 w-full py-1 text-xs" dir="ltr" />
      <span className={"w-4 text-center text-xs font-bold " + (saved ? "text-emerald-700" : "text-transparent")} aria-live="polite">{saved ? "✓" : "·"}</span>
    </div>
  );
}

/**
 * Office rooms: search and filter, cards or a table, tick pilgrims and move them (works on a phone, no dragging needed),
 * drag and drop on a computer, the hotel's room numbers saved as you type. Internal use only.
 */
export function OfficeBoard({ tripId, cards, pool, hotels, canEdit, isAdmin }: { tripId: string; cards: BoardCard[]; pool: BoardPerson[]; hotels: { id: string; name: string }[]; canEdit: boolean; isAdmin: boolean }) {
  const [msg, setMsg] = useState<OfficeActionState | null>(null);
  const [pending, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [f, setF] = useState<RoomFilter>({ q: "", hotel: "", category: "", status: "" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [fOpen, setFOpen] = useState(false); // on a phone the filters stay folded until asked for
  const run = (fn: () => Promise<OfficeActionState>) => start(async () => setMsg(await fn()));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const drop = (roomId: string | null) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) run(() => moveMember(tripId, id, roomId));
  };

  const views = useMemo(() => cards.map((c) => ({ ...c, hotelId: c.hotelId ?? null, housed: housedOf(c), warnings: c.people.filter((p) => p.warning).length })), [cards]);
  const shown = filterRooms(views, f);
  const counts = useMemo(() => ({
    incomplete: views.filter((r) => roomStatus(r) === "incomplete").length, empty: views.filter((r) => roomStatus(r) === "empty").length,
    full: views.filter((r) => roomStatus(r) === "full").length, warning: views.filter((r) => r.warnings > 0).length,
  }), [views]);
  const roomsForMove = views.filter((r) => !r.locked && r.housed < r.capacity);
  const move = (t: string) => { if (!sel.size || !t) return; run(async () => { const r = await moveMembers(tripId, [...sel], t); if (!r.error) { setSel(new Set()); setTarget(""); } return r; }); };
  const chip = (on: boolean) => "rounded-full border px-3 py-1 text-sm font-bold " + (on ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark hover:bg-canvas");

  const personRow = (p: BoardPerson, i: number, room: BoardCard | null) => (
    <div key={p.bookingId} draggable={canEdit && !(room?.locked)} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.bookingId)}
      className={"flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm " + (p.warning ? "border-red-400 bg-red-50 " : sel.has(p.bookingId) ? "border-brand bg-brand-light " : personMatches(p, f.q) ? "border-gold bg-gold-light " : "border-line bg-white ")}>
      {canEdit && !room?.locked && <input type="checkbox" className="h-4 w-4 flex-none" checked={sel.has(p.bookingId)} onChange={() => toggle(p.bookingId)} aria-label={`تحديد ${p.name}`} />}
      {room && <span className="w-4 flex-none text-xs text-brand-mid">{i + 1}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{p.name}{p.head && <HeadTag />}</span>
        <span className="block truncate text-xs text-brand-mid">{[p.agent, p.group, p.noHousing && "بدون سكن", p.reason].filter(Boolean).join(" · ")}</span>
      </span>
      {p.manual && <span title="نُقل يدوياً" aria-label="يدوي" className="flex-none text-xs">✋</span>}
      {p.warning && <span className="flex-none font-bold text-red-700" role="note" title={p.warning}>⚠</span>}
      {room && canEdit && !room.locked && <button type="button" aria-label={`إخراج ${p.name} من الغرفة`} className="flex-none px-1 text-red-700 max-md:min-h-11 max-md:min-w-11" onClick={() => run(() => moveMember(tripId, p.bookingId, null))}>×</button>}
    </div>
  );

  const hotelName = (id: string | null) => hotels.find((h) => h.id === id)?.name ?? "";

  return (
    <div className="space-y-3 pb-24" aria-busy={pending}>
      {/* actions */}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => rerun(tripId))} title="يوزّع غير الموزَّعين فقط ولا يمس الغرف المقفلة ولا من نُقل يدوياً">وزّع المعتمرين تلقائياً</button>
            <select aria-label="نوع الغرفة الجديدة" className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">غرفة بسعة افتراضية</option><option value="SINGLE">سنكل</option><option value="DOUBLE">ثنائية</option><option value="TRIPLE">ثلاثية</option><option value="QUAD">رباعية</option><option value="QUINT">خماسية</option>
            </select>
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => newRoom(tripId, type))}>+ غرفة فارغة</button>
            {isAdmin && (
              <button type="button" className="btn-ghost" disabled={pending}
                onClick={() => { if (window.confirm("إعادة ترقيم الغرف داخل هذه الرحلة بلا فجوات؟ ستتغير أرقام بعض الغرف.")) run(() => renumber(tripId)); }}>إعادة ترقيم</button>
            )}
          </>
        )}
        <div className="ms-auto inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="طريقة العرض">
          {([["cards", "بطاقات"], ["table", "جدول"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={"px-3.5 py-1.5 text-sm font-bold " + (view === v ? "bg-brand text-white" : "bg-white text-brand-dark hover:bg-canvas")}>{l}</button>
          ))}
        </div>
      </div>
      {msg?.error && <p role="alert" className="alert-bad">{msg.error}</p>}
      {msg?.info && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{msg.info}</p>}

      {/* search and filters */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="ابحث: اسم معتمر، جواز، وكيل أو رقم غرفة" aria-label="بحث في الغرف" className="input min-w-[14rem] flex-1" />
        <button type="button" className="btn-secondary md:hidden" aria-expanded={fOpen} onClick={() => setFOpen((o) => !o)}>تصفية{[f.hotel, f.category, f.status].filter(Boolean).length ? ` (${[f.hotel, f.category, f.status].filter(Boolean).length})` : ""} {fOpen ? "▴" : "▾"}</button>
        <div className={"flex-wrap items-center gap-2 md:contents " + (fOpen ? "flex w-full" : "hidden")}>
        {hotels.length > 1 && (
          <select aria-label="الفندق" className="input w-auto" value={f.hotel} onChange={(e) => setF({ ...f, hotel: e.target.value })}>
            <option value="">كل الفنادق</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="الفئة">
          {([["", "الكل"], ["MEN", "رجال"], ["WOMEN", "نساء"], ["FAMILY", "عائلات"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={f.category === v} className={chip(f.category === v)} onClick={() => setF({ ...f, category: v })}>{l}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="الحالة">
          {([["", `كل الغرف (${views.length})`], ["incomplete", `ناقصة (${counts.incomplete})`], ["warning", `فيها تنبيه (${counts.warning})`], ["empty", `فارغة (${counts.empty})`], ["full", `ممتلئة (${counts.full})`]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={f.status === v} className={chip(f.status === v)} onClick={() => setF({ ...f, status: v })}>{l}</button>)}
        </div>
        {(f.q || f.hotel || f.category || f.status) && <button type="button" className="btn-ghost btn-sm" onClick={() => setF({ q: "", hotel: "", category: "", status: "" })}>مسح الفلاتر ({shown.length} من {views.length})</button>}
        </div>
      </div>

      <div className={"grid gap-4 " + (pool.length ? "lg:grid-cols-[17rem_1fr]" : "")}>
        {pool.length > 0 && (
          <aside className={"card h-fit space-y-1.5 " + (over === "pool" ? "ring-2 ring-brand" : "")} onDragOver={(e) => { e.preventDefault(); setOver("pool"); }} onDragLeave={() => setOver(null)} onDrop={drop(null)}>
            <h3 className="font-bold">بدون غرفة ({pool.length})</h3>
            <p className="text-xs text-brand-mid">علّم المعتمرين ثم اختر الغرفة من الشريط السفلي، أو اضغط «وزّع المعتمرين تلقائياً».</p>
            {pool.map((p) => personRow(p, 0, null))}
          </aside>
        )}

        {view === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => {
              const cat = CAT[c.category], empty = Math.max(0, c.capacity - c.housed), st = roomStatus(c);
              return (
                <div key={c.id} data-room={c.label} onDragOver={(e) => { e.preventDefault(); setOver(c.id); }} onDragLeave={() => setOver(null)} onDrop={drop(c.id)}
                  className={"overflow-hidden rounded-xl border-2 bg-white " + (over === c.id ? "ring-2 ring-brand" : "")} style={{ borderColor: cat.fg }}>
                  <div className="flex items-center gap-2 px-3 py-2" style={{ background: cat.bg, color: cat.fg }}>
                    <span className="text-xl font-bold" dir="ltr">{c.label}</span>
                    <span className="min-w-0 flex-1 text-xs font-bold leading-tight">{c.typeLabel} · {cat.label}{c.hotel && <span className="block truncate font-normal">{c.hotel}</span>}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (st === "full" ? "bg-white/70" : st === "empty" ? "bg-white/70" : "bg-amber-100 text-amber-900")}>{st === "full" ? "ممتلئة" : st === "empty" ? "فارغة" : `${empty} شاغر`}</span>
                    {canEdit && <button type="button" aria-label={c.locked ? "فتح القفل" : "قفل الغرفة"} title={c.locked ? "مقفلة" : "قفل"} className="text-base max-md:min-h-11 max-md:min-w-11" onClick={() => run(() => toggleLock(tripId, c.id))}>{c.locked ? "🔒" : "🔓"}</button>}
                  </div>
                  <HotelNos key={c.id + (c.makkahNo ?? "") + (c.madinahNo ?? "")} tripId={tripId} room={c} canEdit={canEdit} run={run} />
                  <div className="space-y-1.5 p-2">
                    {c.people.map((p, i) => personRow(p, i, c))}
                    {Array.from({ length: empty }, (_, i) => <div key={"e" + i} className="rounded-lg border px-2 py-1.5 text-center text-xs" style={{ background: EMPTY.bg, color: EMPTY.fg, borderColor: EMPTY.fg + "55" }}>— سرير فارغ —</div>)}
                    {c.warnings > 0 && <p className="text-xs font-bold text-red-700">⚠ الغرفة لا تناسب {c.warnings} من ساكنيها</p>}
                    {canEdit && c.people.length === 0 && <button type="button" className="text-xs text-red-700 underline" onClick={() => run(() => removeRoom(tripId, c.id))}>حذف الغرفة الفارغة</button>}
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && (
              <div className="card text-center sm:col-span-2 xl:col-span-3">
                <p className="text-sm text-brand-mid">{cards.length === 0 ? "لا توجد غرف بعد — تُنشأ تلقائياً عند إضافة المعتمرين إلى الرحلة." : "لا توجد غرف بهذه الفلاتر."}</p>
                {canEdit && cards.length === 0 && <button type="button" className="btn mt-2" disabled={pending} onClick={() => run(() => rerun(tripId))}>وزّع المعتمرين الآن</button>}
              </div>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr><th className="th">الغرفة</th><th className="th">الفندق</th><th className="th">النوع</th><th className="th">المعتمرون</th><th className="th">الحالة</th><th className="th">غرفة مكة</th><th className="th">غرفة المدينة</th></tr></thead>
              <tbody>
                {shown.map((c) => {
                  const st = roomStatus(c);
                  return (
                    <tr key={c.id} data-room={c.label}>
                      <td className="td font-bold" dir="ltr">{c.locked ? "🔒 " : ""}{c.label}</td>
                      <td className="td text-sm">{hotelName(c.hotelId) || "—"}</td>
                      <td className="td text-sm">{c.typeLabel} · {CAT[c.category].label}</td>
                      <td className="td text-sm">{c.people.map((p, i) => <div key={p.bookingId} className={personMatches(p, f.q) ? "rounded bg-gold-light px-1" : ""}>{i + 1}. {p.name}{p.noHousing ? " (بدون سكن)" : ""}{p.warning ? " ⚠" : ""}</div>)}</td>
                      <td className="td"><span className={"chip " + (st === "full" ? "chip-ok" : st === "empty" ? "chip-gray" : "chip-warn")}>{st === "full" ? "ممتلئة" : st === "empty" ? "فارغة" : `${c.capacity - c.housed} شاغر`}</span></td>
                      <td className="td" colSpan={2}><HotelNos key={c.id + (c.makkahNo ?? "") + (c.madinahNo ?? "")} tripId={tripId} room={c} canEdit={canEdit} run={run} /></td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={7}>لا توجد غرف بهذه الفلاتر</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* selection bar */}
      {canEdit && sel.size > 0 && (
        <div role="region" aria-label="نقل المحددين" className="fixed inset-x-0 bottom-16 z-40 mx-auto flex w-[min(60rem,calc(100%-1rem))] flex-wrap items-center gap-2 rounded-2xl border border-brand bg-white p-3 shadow-2xl md:bottom-4">
          <span className="font-bold">{sel.size} محدد</span>
          <select aria-label="نقل إلى غرفة" className="input w-auto min-w-[12rem] flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">انقل إلى غرفة…</option>
            {roomsForMove.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.capacity - r.housed} شاغر{r.hotel ? ` — ${r.hotel}` : ""}</option>)}
          </select>
          <button type="button" className="btn" disabled={pending || !target} onClick={() => move(target)}>نقل</button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => move("new")}>غرفة جديدة لهم</button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => move("none")}>إخراج من الغرف</button>
          <button type="button" className="btn-ghost" onClick={() => setSel(new Set())}>إلغاء التحديد</button>
        </div>
      )}
    </div>
  );
}
