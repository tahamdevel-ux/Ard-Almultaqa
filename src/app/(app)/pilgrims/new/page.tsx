import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PilgrimForm } from "@/components/PilgrimForm";
import { savePilgrim } from "../actions";
import { hotelOptions, tripChoices } from "@/server/trips";

export default async function NewPilgrim() {
  const user = await requirePage("pilgrims.write");
  const [trips, hotels] = await Promise.all([tripChoices(), hotelOptions()]);
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="space-y-4">
      <h1 className="page-title">معتمر جديد</h1>
      <PilgrimForm action={savePilgrim.bind(null, null)} agents={agents} canHealth={can(user.role, "pilgrims.health")} redirectTo trips={trips} hotels={hotels} values={{ nationality: "IRAQI" }} />
    </div>
  );
}
