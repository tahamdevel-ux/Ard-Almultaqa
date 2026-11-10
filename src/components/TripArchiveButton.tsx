"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveTrip, unarchiveTrip } from "@/app/(app)/trips/actions";

export function TripArchiveButton({ tripId, name, archived, canArchive, canUnarchive }: { tripId: string; name: string; archived: boolean; canArchive: boolean; canUnarchive: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (archived ? !canUnarchive : !canArchive) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn-secondary" disabled={pending} onClick={() => {
        if (!archived && !window.confirm(`أرشفة الرحلة «${name}»؟\nتختفي من قائمة الرحلات ومن كل القوائم المنسدلة، وتبقى بكل معتمريها ودفعاتها في «الأرشيف».`)) return;
        start(async () => { const r = archived ? await unarchiveTrip(tripId) : await archiveTrip(tripId); if (r.error) setErr(r.error); else router.push(archived ? `/trips/${tripId}` : "/trips"); router.refresh(); });
      }}>{archived ? "إلغاء الأرشفة" : "أرشفة الرحلة"}</button>
      {err && <span role="alert" className="text-xs font-bold text-red-700">{err}</span>}
    </span>
  );
}
