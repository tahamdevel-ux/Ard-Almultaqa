import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePage, requirePermission } from "@/server/auth";
import { redirect } from "next/navigation";
import { PhoneInput } from "@/components/PhoneInput";
import { can } from "@/lib/permissions";
import { checkPhoneList } from "@/domain/identity";
import { isRoomCode } from "@/domain/officeRooms";

async function addAgent(form: FormData) {
  "use server";
  await requirePermission("agents.write");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const ph = checkPhoneList(String(form.get("phones") ?? ""));
  if (ph.error) redirect("/agents?error=" + encodeURIComponent(ph.error));
  const roomCode = String(form.get("roomCode") ?? "").trim();
  const rcErr = await roomCodeError(roomCode);
  if (rcErr) redirect("/agents?error=" + encodeURIComponent(rcErr));
  await db.agent.create({
    data: {
      name,
      officeName: String(form.get("officeName") ?? "").trim() || null,
      phones: ph.values,
      roomCode: roomCode || null,
      address: String(form.get("address") ?? "").trim() || null,
    },
  });
  revalidatePath("/agents");
}

/** Room code: 1 or 2 lowercase Latin letters, unique across agents, optional; used on the internal office room labels. */
async function roomCodeError(raw: string, exceptId?: string): Promise<string | null> {
  if (!raw) return null;
  if (!isRoomCode(raw)) return "رمز الغرف يجب أن يكون حرفاً أو حرفين إنكليزيين صغيرين (a, b … aa, ab)";
  const dup = await db.agent.findFirst({ where: { roomCode: raw, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  return dup ? `رمز الغرف «${raw}» مستخدم لوكيل آخر` : null;
}

async function setRoomCode(id: string, form: FormData) {
  "use server";
  await requirePermission("agents.write");
  const code = String(form.get("roomCode") ?? "").trim();
  const err = await roomCodeError(code, id);
  if (err) redirect("/agents?error=" + encodeURIComponent(err));
  await db.agent.update({ where: { id }, data: { roomCode: code || null } });
  revalidatePath("/agents");
}

async function deleteAgent(id: string) {
  "use server";
  await requirePermission("agents.write");
  await db.agent.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/agents");
}

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requirePage("agents.view");
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { pilgrims: true } } } });
  const w = can(user.role, "agents.write");
  return (
    <div className="space-y-4">
      <h1 className="page-title">الوكلاء</h1>
      {error && <p role="alert" className="alert-bad">{error}</p>}
      {w && (
        <form action={addAgent} className="card grid gap-3 sm:grid-cols-3">
          <div><label className="label">اسم الوكيل *</label><input name="name" className="input" required /></div>
          <div><label className="label">اسم المكتب</label><input name="officeName" className="input" /></div>
          <div><label className="label">الهواتف</label><PhoneInput name="phones" multi className="input" /></div>
          <div><label className="label">العنوان</label><input name="address" className="input" /></div>
          <div><label className="label" htmlFor="roomCode">رمز الغرف (اختياري)</label><input id="roomCode" name="roomCode" maxLength={2} pattern="[a-z]{1,2}" className="input" dir="ltr" placeholder="a" /></div>
          <div className="sm:col-span-3"><button className="btn">إضافة وكيل</button></div>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الوكيل</th><th className="th">المكتب</th><th className="th">الهواتف</th><th className="th">المعتمرون</th><th className="th">رمز الغرف</th><th className="th" /></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} data-href={can(user.role, "payments.view") ? `/agents/${a.id}` : undefined}>
                <td className="td font-bold">{can(user.role, "payments.view") ? <a className="text-brand underline" href={`/agents/${a.id}`}>{a.name}</a> : a.name}</td><td className="td">{a.officeName}</td>
                <td className="td ltr">{a.phones.join("، ")}</td>
                <td className="td">{a._count.pilgrims}</td>
                <td className="td">{w ? (
                  <form action={setRoomCode.bind(null, a.id)} className="flex items-center gap-1">
                    <input name="roomCode" defaultValue={a.roomCode ?? ""} maxLength={2} pattern="[a-z]{1,2}" aria-label={`رمز غرف ${a.name}`} className="input w-16 py-1" dir="ltr" />
                    <button className="btn-secondary py-1">حفظ</button>
                  </form>
                ) : <span dir="ltr">{a.roomCode}</span>}</td>
                <td className="td">{w && <form action={deleteAgent.bind(null, a.id)}><button className="text-sm text-red-700 underline">حذف</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
