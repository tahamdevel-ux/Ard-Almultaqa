import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PilgrimForm } from "@/components/PilgrimForm";
import { Toast } from "@/components/Toast";
import { savePilgrim } from "../actions";
import { hotelOptions, tripChoices } from "@/server/trips";
import { fullNameAr } from "@/server/pilgrims";
import { safeReturnTo } from "@/lib/returnTo";

export default async function NewPilgrim({ searchParams }: { searchParams: Promise<{ returnTo?: string; saved?: string; keep?: string }> }) {
  const user = await requirePage("pilgrims.write");
  const sp = await searchParams;
  const [trips, hotels] = await Promise.all([tripChoices(), hotelOptions()]);
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const saved = sp.saved ? await db.pilgrim.findUnique({ where: { id: sp.saved } }) : null;
  // what the previous pilgrim leaves: only known shared keys, only valid trips / agents
  let keep: Record<string, string | string[]> = {};
  try {
    const raw = JSON.parse(sp.keep ?? "{}") as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) if (/^(tripIds|agentId|makkahHotelId__.+|madinahHotelId__.+|roomType__.+|hotelId__.+|housing__.+|food__.+|sarf__.+|headOf__.+|isHead__.+)$/.test(k) && (typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")))) keep[k] = v as string | string[];
  } catch { keep = {}; }
  const tid = keep.tripIds; const tl = (Array.isArray(tid) ? tid : tid ? [tid] : []).filter((id) => trips.some((t) => t.id === id));
  keep.tripIds = tl;
  if (typeof keep.agentId === "string" && !agents.some((a) => a.id === keep.agentId)) delete keep.agentId;
  return (
    <div className="space-y-4">
      <h1 className="page-title">معتمر جديد</h1>
      {saved && <Toast text={`تم حفظ ${fullNameAr(saved)}`} />}
      <PilgrimForm key={sp.saved ?? "new"} action={savePilgrim.bind(null, null)} agents={agents} canHealth={can(user.role, "pilgrims.health")} trips={trips} hotels={hotels}
        returnTo={safeReturnTo(sp.returnTo)} initialKeep={keep} values={{ nationality: "IRAQI", agentId: typeof keep.agentId === "string" ? keep.agentId : undefined }} />
    </div>
  );
}
