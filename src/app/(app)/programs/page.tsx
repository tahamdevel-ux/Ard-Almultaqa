import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePage, requirePermission } from "@/server/auth";
import { parseDate } from "@/domain/dates";
import { TRANSPORT_LABELS } from "@/lib/labels";

async function createFromProgram(programId: string, form: FormData) {
  "use server";
  await requirePermission("trips.write");
  const p = await db.program.findUniqueOrThrow({ where: { id: programId } });
  const tripNo = String(form.get("tripNo") ?? "").trim();
  const depart = parseDate(String(form.get("departDate") ?? "").trim());
  if (!tripNo || !depart) redirect("/programs?error=" + encodeURIComponent("أدخل رقم الرحلة وتاريخ الذهاب بصيغة DD/MM/YYYY"));
  if (await db.trip.findUnique({ where: { tripNo } })) redirect("/programs?error=" + encodeURIComponent("رقم الرحلة مستخدم"));
  const ret = new Date(depart.getTime() + p.durationDays * 86400000);
  const trip = await db.trip.create({ data: {
    tripNo, name: p.name, transportType: p.transportType, departDate: depart, returnDate: ret,
    nightsMakkah: p.nightsMakkah, nightsMadinah: p.nightsMadinah, firstCity: p.firstCity,
    makkahHotelId: p.makkahHotelId, madinahHotelId: p.madinahHotelId, capacity: p.capacity,
  } });
  for (let i = 1; i <= p.busCount; i++) await db.bus.create({ data: { tripId: trip.id, number: String(i), seatCount: p.seatsPerBus } });
  redirect(`/trips/${trip.id}`);
}
async function deleteProgram(id: string) {
  "use server";
  await requirePermission("programs.write");
  await db.program.delete({ where: { id } });
  revalidatePath("/programs");
}

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePage("trips.write");
  const { error } = await searchParams;
  const programs = await db.program.findMany({ orderBy: { createdAt: "desc" }, include: { makkahHotel: true, madinahHotel: true } });
  return (
    <div className="space-y-4">
      <h1 className="page-title">قوالب الرحلات</h1>
      <p className="text-sm text-brand-mid">احفظ أي رحلة كقالب من صفحتها، ثم أنشئ الرحلات المتكررة (قافلة الأحد البرية، الرحلة الجوية كل 10 أيام) بضغطة واحدة.</p>
      {error && <p role="alert" className="alert-bad">{error}</p>}
      {programs.map((p) => (
        <div key={p.id} className="card space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold">{p.name}</h2>
              <p className="text-sm text-brand-mid">{TRANSPORT_LABELS[p.transportType]} · {p.durationDays} يوم · مكة {p.nightsMakkah} / المدينة {p.nightsMadinah} ليالي · السعة {p.capacity}{p.busCount ? ` · ${p.busCount} باص` : ""}</p>
              <p className="text-sm text-brand-mid">مكة: {p.makkahHotel?.localName ?? p.makkahHotel?.officialName ?? "—"} · المدينة: {p.madinahHotel?.localName ?? p.madinahHotel?.officialName ?? "—"}</p>
            </div>
            <form action={deleteProgram.bind(null, p.id)}><button className="text-sm text-red-700 underline">حذف القالب</button></form>
          </div>
          <form action={createFromProgram.bind(null, p.id)} className="flex flex-wrap items-end gap-2">
            <div><label className="label">رقم الرحلة الجديدة</label><input name="tripNo" className="input w-36" dir="ltr" required /></div>
            <div><label className="label">تاريخ الذهاب</label><input name="departDate" className="input w-36" dir="ltr" placeholder="DD/MM/YYYY" required /></div>
            <button className="btn">إنشاء رحلة من القالب</button>
          </form>
        </div>
      ))}
      {programs.length === 0 && <p className="card text-center text-sm text-brand-mid">لا توجد قوالب بعد</p>}
    </div>
  );
}
