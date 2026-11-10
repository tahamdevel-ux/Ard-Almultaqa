"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveTrip, deleteTrip, unarchiveTrip } from "@/app/(app)/trips/actions";

export function TripRowActions({ tripId, name, pilgrims, payments, archived, canWrite, canArchive, canUnarchive }: { tripId: string; name: string; pilgrims: number; payments: number; archived: boolean; canWrite: boolean; canArchive: boolean; canUnarchive: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function remove() {
    const msg = `حذف الرحلة «${name}»؟\n` + (pilgrims ? `سيُلغى حجز ${pilgrims} معتمر (المعتمرون أنفسهم لا يُحذفون).\n` : "") + (payments ? `فيها ${payments} دفعة تبقى محفوظة في السجل.\n` : "") + "لا يمكن التراجع من الشاشة.";
    if (!window.confirm(msg)) return;
    start(async () => { const r = await deleteTrip(tripId); if (r.error) setErr(r.error); else router.refresh(); });
  }
  function archive() {
    if (!window.confirm(`أرشفة الرحلة «${name}»؟\nتختفي من قائمة الرحلات ومن كل القوائم المنسدلة، وتبقى بكل معتمريها ودفعاتها في «الأرشيف».`)) return;
    start(async () => { const r = await archiveTrip(tripId); if (r.error) setErr(r.error); else router.refresh(); });
  }
  function unarchive() {
    start(async () => { const r = await unarchiveTrip(tripId); if (r.error) setErr(r.error); else router.refresh(); });
  }
  return (
    <span className="flex items-center gap-3 text-sm">
      {canWrite && <Link className="text-brand underline" href={`/trips/${tripId}/edit`}>تعديل</Link>}
      {canArchive && !archived && <button type="button" className="text-brand-mid underline" disabled={pending} onClick={archive}>أرشفة</button>}
      {canUnarchive && archived && <button type="button" className="text-brand underline" disabled={pending} onClick={unarchive}>إلغاء الأرشفة</button>}
      {canWrite && <button type="button" className="text-red-700 underline" disabled={pending} onClick={remove}>حذف</button>}
      {err && <span role="alert" className="text-xs font-bold text-red-700">{err}</span>}
    </span>
  );
}
