import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage, requirePermission } from "@/server/auth";
import { parseTripIdentity } from "@/domain/tripFields";
import { ensureFirstBus, withTripLock } from "@/server/buses";
import { DateInput } from "@/components/DateInput";

async function createTrip(form: FormData) {
  "use server";
  await requirePermission("trips.write");
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = parseTripIdentity({ tripNo: s("tripNo"), departDate: s("departDate"), returnDate: s("returnDate") });
  if (!s("name")) redirect("/trips/new?error=" + encodeURIComponent("اسم البرنامج مطلوب"));
  if (!id.ok) redirect("/trips/new?error=" + encodeURIComponent(id.error));
  if (id.tripNo && (await db.trip.findUnique({ where: { tripNo: id.tripNo } }))) redirect("/trips/new?error=" + encodeURIComponent("رقم الرحلة مستخدم"));
  const t = await db.trip.create({
    data: {
      tripNo: id.tripNo, name: s("name"), transportType: s("transportType") === "AIR" ? "AIR" : "LAND",
      departDate: id.departDate, returnDate: id.returnDate, nightsMakkah: +s("nightsMakkah") || 0, nightsMadinah: +s("nightsMadinah") || 0,
      capacity: +s("capacity") || 0, supervisorId: s("supervisorId") || null,
    },
  });
  await withTripLock(db, t.id, (tx) => ensureFirstBus(tx, t.id)); // land trips open with bus 1
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
        <div><label className="label">رقم الرحلة</label><input name="tripNo" className="input" dir="ltr" /></div>
        <div><label className="label">اسم البرنامج *</label><input name="name" className="input" required /></div>
        <div><label className="label">النقل</label><select name="transportType" className="input"><option value="LAND">بري</option><option value="AIR">جوي</option></select></div>
        <div><label className="label">تاريخ الذهاب</label><DateInput name="departDate" className="input" /></div>
        <div><label className="label">تاريخ العودة</label><DateInput name="returnDate" className="input" /></div>
        <div><label className="label">السعة القصوى</label><input name="capacity" type="number" className="input" dir="ltr" /></div>
        <div><label className="label">ليالي مكة</label><input name="nightsMakkah" type="number" className="input" dir="ltr" /></div>
        <div><label className="label">ليالي المدينة</label><input name="nightsMadinah" type="number" className="input" dir="ltr" /></div>
        <div><label className="label">المشرف</label><select name="supervisorId" className="input"><option value="">—</option>{supervisors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="sm:col-span-3"><button className="btn">إنشاء</button></div>
      </form>
    </div>
  );
}
