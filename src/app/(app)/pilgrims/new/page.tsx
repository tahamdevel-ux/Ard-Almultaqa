import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PilgrimForm } from "@/components/PilgrimForm";
import { savePilgrim } from "../actions";

export default async function NewPilgrim() {
  const user = await requirePage("pilgrims.write");
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">معتمر جديد</h1>
      <PilgrimForm action={savePilgrim.bind(null, null)} agents={agents} canHealth={can(user.role, "pilgrims.health")} redirectTo values={{ nationality: "IRAQI" }} />
    </div>
  );
}
