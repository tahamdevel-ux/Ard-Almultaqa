import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { hashPassword, requirePage, requirePermission } from "@/server/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

async function addUser(form: FormData) {
  "use server";
  await requirePermission("users.manage");
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role")) as Role;
  if (!username || password.length < 8 || !(role in ROLE_LABELS)) return;
  await db.user.create({ data: { username, name: String(form.get("name") ?? "").trim() || username, passwordHash: await hashPassword(password), role } });
  revalidatePath("/users");
}
async function toggleUser(id: string, active: boolean) {
  "use server";
  const me = await requirePermission("users.manage");
  if (me.id === id) return;
  await db.user.update({ where: { id }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId: id } });
  revalidatePath("/users");
}
async function resetPassword(id: string, form: FormData) {
  "use server";
  await requirePermission("users.manage");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return;
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId: id } });
  revalidatePath("/users");
}

export default async function UsersPage() {
  await requirePage("users.manage");
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المستخدمون والصلاحيات</h1>
      <form action={addUser} className="card grid gap-3 sm:grid-cols-4">
        <div><label className="label">الاسم</label><input name="name" className="input" /></div>
        <div><label className="label">اسم المستخدم *</label><input name="username" className="input" dir="ltr" required /></div>
        <div><label className="label">كلمة المرور (8 أحرف+) *</label><input name="password" type="password" minLength={8} className="input" dir="ltr" required /></div>
        <div><label className="label">الدور</label>
          <select name="role" className="input">{Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="sm:col-span-4"><button className="btn">إضافة مستخدم</button></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الاسم</th><th className="th">المستخدم</th><th className="th">الدور</th><th className="th">الحالة</th><th className="th">كلمة مرور جديدة</th><th className="th" /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td">{u.name}</td><td className="td ltr">{u.username}</td><td className="td">{ROLE_LABELS[u.role]}</td>
                <td className="td"><span className={"chip " + (u.active ? "chip-ok" : "chip-bad")}>{u.active ? "فعّال" : "معطّل"}</span></td>
                <td className="td"><form action={resetPassword.bind(null, u.id)} className="flex gap-1"><input name="password" type="password" minLength={8} className="input" dir="ltr" /><button className="btn-secondary">تغيير</button></form></td>
                <td className="td"><form action={toggleUser.bind(null, u.id, !u.active)}><button className="text-sm underline">{u.active ? "تعطيل" : "تفعيل"}</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
