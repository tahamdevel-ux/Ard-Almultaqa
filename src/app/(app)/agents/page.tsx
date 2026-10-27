import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePage, requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";

async function addAgent(form: FormData) {
  "use server";
  await requirePermission("agents.write");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await db.agent.create({
    data: {
      name,
      officeName: String(form.get("officeName") ?? "").trim() || null,
      phones: String(form.get("phones") ?? "").split(/[,،\s]+/).filter(Boolean),
      address: String(form.get("address") ?? "").trim() || null,
      commissionType: form.get("commissionType") === "FIXED_WHOLESALE" ? "FIXED_WHOLESALE" : "PERCENT",
      commissionValue: Number(form.get("commissionValue") ?? 0) || 0,
    },
  });
  revalidatePath("/agents");
}

async function deleteAgent(id: string) {
  "use server";
  await requirePermission("agents.write");
  await db.agent.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/agents");
}

export default async function AgentsPage() {
  const user = await requirePage("agents.view");
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { pilgrims: true } } } });
  const w = can(user.role, "agents.write");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الوكلاء</h1>
      {w && (
        <form action={addAgent} className="card grid gap-3 sm:grid-cols-3">
          <div><label className="label">اسم الوكيل *</label><input name="name" className="input" required /></div>
          <div><label className="label">اسم المكتب</label><input name="officeName" className="input" /></div>
          <div><label className="label">الهواتف</label><input name="phones" className="input" dir="ltr" /></div>
          <div><label className="label">العنوان</label><input name="address" className="input" /></div>
          <div><label className="label">نوع العمولة</label>
            <select name="commissionType" className="input"><option value="PERCENT">نسبة %</option><option value="FIXED_WHOLESALE">سعر جملة ثابت</option></select></div>
          <div><label className="label">القيمة</label><input name="commissionValue" type="number" step="any" className="input" dir="ltr" /></div>
          <div className="sm:col-span-3"><button className="btn">إضافة وكيل</button></div>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الوكيل</th><th className="th">المكتب</th><th className="th">الهواتف</th><th className="th">العمولة</th><th className="th">المعتمرون</th><th className="th" /></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td className="td font-bold">{a.name}</td><td className="td">{a.officeName}</td>
                <td className="td ltr">{a.phones.join("، ")}</td>
                <td className="td">{a.commissionType === "PERCENT" ? `${a.commissionValue}%` : `${a.commissionValue} جملة`}</td>
                <td className="td">{a._count.pilgrims}</td>
                <td className="td">{w && <form action={deleteAgent.bind(null, a.id)}><button className="text-sm text-red-700 underline">حذف</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
