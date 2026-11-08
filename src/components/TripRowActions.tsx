"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteTrip } from "@/app/(app)/trips/actions";

export function TripRowActions({ tripId, name, pilgrims, payments }: { tripId: string; name: string; pilgrims: number; payments: number }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function remove() {
    const msg = `حذف الرحلة «${name}»؟\n` + (pilgrims ? `سيُلغى حجز ${pilgrims} معتمر (المعتمرون أنفسهم لا يُحذفون).\n` : "") + (payments ? `فيها ${payments} دفعة تبقى محفوظة في السجل.\n` : "") + "لا يمكن التراجع من الشاشة.";
    if (!window.confirm(msg)) return;
    start(async () => { const r = await deleteTrip(tripId); if (r.error) setErr(r.error); else router.refresh(); });
  }
  return (
    <span className="flex items-center gap-3 text-sm">
      <Link className="text-brand underline" href={`/trips/${tripId}/edit`}>تعديل</Link>
      <button type="button" className="text-red-700 underline" disabled={pending} onClick={remove}>حذف</button>
      {err && <span role="alert" className="text-xs font-bold text-red-700">{err}</span>}
    </span>
  );
}
