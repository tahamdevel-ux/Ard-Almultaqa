"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RowMenu } from "@/components/RowMenu";
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
  if (!canWrite && !canArchive && !canUnarchive) return null;
  return (
    <span className="inline-flex flex-col items-end">
      <RowMenu label={`إجراءات ${name}`}>
        {canWrite && <Link className="menu-item" href={`/trips/${tripId}/edit`}>تعديل الرحلة</Link>}
        {canArchive && !archived && <button type="button" className="menu-item" disabled={pending} onClick={archive}>أرشفة</button>}
        {canUnarchive && archived && <button type="button" className="menu-item" disabled={pending} onClick={unarchive}>إلغاء الأرشفة</button>}
        {canWrite && <button type="button" className="menu-item menu-item-danger" disabled={pending} onClick={remove}>حذف</button>}
      </RowMenu>
      {err && <span role="alert" className="text-xs font-bold text-red-700">{err}</span>}
    </span>
  );
}
