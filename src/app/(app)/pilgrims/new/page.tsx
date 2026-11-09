import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PilgrimForm } from "@/components/PilgrimForm";
import { Toast } from "@/components/Toast";
import { savePilgrim } from "../actions";
import { hotelOptions, tripChoices } from "@/server/trips";
import { fullNameAr } from "@/server/pilgrims";
import { safeReturnTo } from "@/lib/returnTo";

export default async function NewPilgrim({ searchParams }: { searchParams: Promise<{ returnTo?: string; saved?: string; trips?: string; agent?: string }> }) {
  const user = await requirePage("pilgrims.write");
  const sp = await searchParams;
  const [trips, hotels] = await Promise.all([tripChoices(), hotelOptions()]);
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const saved = sp.saved ? await db.pilgrim.findUnique({ where: { id: sp.saved } }) : null;
  const preTrips = (sp.trips ?? "").split(",").filter((id) => trips.some((t) => t.id === id));
  const preAgent = agents.some((a) => a.id === sp.agent) ? sp.agent : undefined;
  return (
    <div className="space-y-4">
      <h1 className="page-title">معتمر جديد</h1>
      {saved && <Toast text={`تم حفظ ${fullNameAr(saved)}`} />}
      <PilgrimForm key={sp.saved ?? "new"} action={savePilgrim.bind(null, null)} agents={agents} canHealth={can(user.role, "pilgrims.health")} trips={trips} hotels={hotels}
        returnTo={safeReturnTo(sp.returnTo)} initialTripIds={preTrips} values={{ nationality: "IRAQI", agentId: preAgent }} />
    </div>
  );
}
