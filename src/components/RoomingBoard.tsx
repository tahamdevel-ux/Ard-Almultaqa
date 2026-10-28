"use client";
import { useState, useTransition } from "react";
import { moveBooking, deleteRoom, type RoomingResult } from "@/app/(app)/trips/[id]/rooming/actions";

export interface BoardPerson { bookingId: string; name: string; gender: "MALE" | "FEMALE"; group?: string }
export interface BoardRoom { id: string; roomNo: string; beds: number; typeLabel: string; people: BoardPerson[] }

const tone = { empty: "border-line bg-white", partial: "border-gold bg-gold-light", full: "border-brand bg-brand-light" };

export function RoomingBoard({ tripId, city, rooms, pool, canEdit }: { tripId: string; city: "MAKKAH" | "MADINAH"; rooms: BoardRoom[]; pool: BoardPerson[]; canEdit: boolean }) {
  const [msg, setMsg] = useState<RoomingResult | null>(null);
  const [pending, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);

  const move = (bookingId: string, roomId: string | null) =>
    start(async () => setMsg(await moveBooking(tripId, city, bookingId, roomId)));

  const chip = (p: BoardPerson) => (
    <div key={p.bookingId} draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.bookingId)}
      className={"flex items-center gap-1 rounded border px-1.5 py-1 text-xs " + (p.gender === "FEMALE" ? "border-pink-300 bg-pink-50" : "border-sky-300 bg-sky-50") + (canEdit ? " cursor-grab" : "")}>
      <span>{p.gender === "FEMALE" ? "♀" : "♂"}</span><span className="flex-1">{p.name}</span>
      {p.group && <span className="rounded bg-brand-light px-1">{p.group}</span>}
      {canEdit && <button type="button" aria-label="إخراج من الغرفة" className="text-red-700" onClick={() => move(p.bookingId, null)}>×</button>}
    </div>
  );
  const drop = (roomId: string | null) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, roomId);
  };

  return (
    <div className="space-y-3" aria-busy={pending}>
      {msg?.error && <p role="alert" className="alert-bad">{msg.error}</p>}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <aside className={"card space-y-1 " + (over === "pool" ? "ring-2 ring-brand" : "")} onDragOver={(e) => { e.preventDefault(); setOver("pool"); }} onDragLeave={() => setOver(null)} onDrop={drop(null)}>
          <h3 className="font-bold">بدون غرفة ({pool.length})</h3>
          {pool.map((p) => (
            <div key={p.bookingId} className="space-y-0.5">
              {chip(p)}
              {canEdit && (
                <select aria-label={`نقل ${p.name} إلى غرفة`} className="w-full rounded border text-xs" value="" onChange={(e) => e.target.value && move(p.bookingId, e.target.value)}>
                  <option value="">نقل إلى غرفة…</option>
                  {rooms.filter((r) => r.people.length < r.beds).map((r) => <option key={r.id} value={r.id}>{r.roomNo} ({r.beds - r.people.length} شاغر)</option>)}
                </select>
              )}
            </div>
          ))}
          {pool.length === 0 && <p className="text-xs text-brand-mid">الكل مسكّن ✓</p>}
        </aside>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((r) => {
            const st = r.people.length === 0 ? "empty" : r.people.length >= r.beds ? "full" : "partial";
            return (
              <div key={r.id} data-room={r.roomNo} onDragOver={(e) => { e.preventDefault(); setOver(r.id); }} onDragLeave={() => setOver(null)} onDrop={drop(r.id)}
                className={`rounded-lg border-2 p-2 ${tone[st]} ${over === r.id ? "ring-2 ring-brand" : ""}`}>
                <div className="mb-1 flex items-center justify-between text-sm font-bold">
                  <span>غرفة {r.roomNo} <span className="text-xs font-normal text-brand-mid">{r.typeLabel}</span></span>
                  <span className="text-xs">{r.people.length}/{r.beds}</span>
                </div>
                <div className="min-h-8 space-y-1">{r.people.map(chip)}</div>
                {canEdit && r.people.length === 0 && (
                  <button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => start(async () => setMsg(await deleteRoom(tripId, r.id)))}>حذف الغرفة</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
