import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage, requirePermission } from "@/server/auth";
import { parseDate } from "@/domain/dates";

async function createTrip(form: FormData) {
  "use server";
  await requirePermission("trips.write");
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const depart = parseDate(s("departDate")), ret = parseDate(s("returnDate"));
  if (!s("tripNo") || !s("name") || !depart || !ret || ret < depart) redirect("/trips/new?error=" + encodeURIComponent("تحقّق من رقم الرحلة والاسم والتواريخ"));
  if (await db.trip.findUnique({ where: { tripNo: s("tripNo") } })) redirect("/trips/new?error=" + encodeURIComponent("رقم الرحلة مستخدم"));
  const t = await db.trip.create({
    data: {
      tripNo: s("tripNo"), name: s("name"), transportType: s("transportType") === "AIR" ? "AIR" : "LAND",
      departDate: depart!, returnDate: ret!, nightsMakkah: +s("nightsMakkah") || 0, nightsMadinah: +s("nightsMadinah") || 0,
      capacity: +s("capacity") || 0, supervisorId: s("supervisorId") || null,
    },
  });
  redirect(`/trips/${t.id}`);
}

export default async function NewTrip({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePage("trips.write");
  const { error } = await searchParams;
  const supervisors = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  return (
    <div className="space-y-4">
      <h1 className="page-title">رحلة جديدة</h1>
      {error && <p role="alert" className="alert-bad">{error}</p>}
      <form action={createTrip} className="card grid gap-3 sm:grid-cols-3">
        <div><label className="label">رقم الرحلة *</label><input name="tripNo" className="input" dir="ltr" required /></div>
        <div><label className="label">اسم البرنامج *</label><input name="name" className="input" required /></div>
        <div><label className="label">النقل</label><select name="transportType" className="input"><option value="LAND">بري</option><option value="AIR">جوي</option></select></div>
        <div><label className="label">تاريخ الذهاب *</label><input name="departDate" className="input" dir="ltr" placeholder="DD/MM/YYYY" required /></div>
        <div><label className="label">تاريخ العودة *</label><input name="returnDate" className="input" dir="ltr" placeholder="DD/MM/YYYY" required /></div>
        <div><label className="label">السعة القصوى</label><input name="capacity" type="number" className="input" dir="ltr" /></div>
        <div><label className="label">ليالي مكة</label><input name="nightsMakkah" type="number" className="input" dir="ltr" /></div>
        <div><label className="label">ليالي المدينة</label><input name="nightsMadinah" type="number" className="input" dir="ltr" /></div>
        <div><label className="label">المشرف</label><select name="supervisorId" className="input"><option value="">—</option>{supervisors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="sm:col-span-3"><button className="btn">إنشاء</button></div>
      </form>
    </div>
  );
}
