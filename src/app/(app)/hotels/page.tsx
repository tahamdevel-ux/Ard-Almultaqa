import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePage, requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";

const CITY = { MAKKAH: "مكة المكرمة", MADINAH: "المدينة المنورة" } as const;

async function saveHotel(form: FormData) {
  "use server";
  await requirePermission("hotels.write");
  const s = (k: string) => String(form.get(k) ?? "").trim();
  if (!s("officialName")) return;
  const data = { officialName: s("officialName"), localName: s("localName") || null, city: s("city") === "MADINAH" ? "MADINAH" as const : "MAKKAH" as const,
    address: s("address") || null, licenseNo: s("licenseNo") || null, mealsIncluded: form.get("mealsIncluded") === "on" };
  const id = s("id");
  if (id) await db.hotel.update({ where: { id }, data }); else await db.hotel.create({ data });
  revalidatePath("/hotels");
}
async function deleteHotel(id: string) {
  "use server";
  await requirePermission("hotels.write");
  await db.hotel.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/hotels");
}

export default async function HotelsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePage("hotels.view");
  const { edit } = await searchParams;
  const hotels = await db.hotel.findMany({ where: { deletedAt: null }, orderBy: [{ city: "asc" }, { officialName: "asc" }] });
  const cur = hotels.find((h) => h.id === edit);
  const w = can(user.role, "hotels.write");
  return (
    <div className="space-y-4">
      <h1 className="page-title">الفنادق</h1>
      {w && (
        <form action={saveHotel} className="card grid gap-3 sm:grid-cols-3" key={cur?.id ?? "new"}>
          <input type="hidden" name="id" defaultValue={cur?.id ?? ""} />
          <div><label className="label">الاسم الرسمي (English) *</label><input name="officialName" defaultValue={cur?.officialName} className="input" dir="ltr" required /></div>
          <div><label className="label">الاسم المتعارف عليه (مثلاً: رمادا)</label><input name="localName" defaultValue={cur?.localName ?? ""} className="input" /></div>
          <div><label className="label">المدينة</label>
            <select name="city" defaultValue={cur?.city ?? "MAKKAH"} className="input"><option value="MAKKAH">مكة المكرمة</option><option value="MADINAH">المدينة المنورة</option></select></div>
          <div><label className="label">العنوان / الموقع</label><input name="address" defaultValue={cur?.address ?? ""} className="input" /></div>
          <div><label className="label">رقم الترخيص السياحي</label><input name="licenseNo" defaultValue={cur?.licenseNo ?? ""} className="input" dir="ltr" /></div>
          <label className="flex items-end gap-2 pb-2 text-sm font-bold"><input type="checkbox" name="mealsIncluded" defaultChecked={cur?.mealsIncluded ?? true} /> وجبتان يومياً مشمولة</label>
          <div className="sm:col-span-3"><button className="btn">{cur ? "حفظ التعديل" : "إضافة فندق"}</button></div>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الاسم المتعارف</th><th className="th">الاسم الرسمي</th><th className="th">المدينة</th><th className="th">العنوان</th><th className="th">الترخيص</th><th className="th">الوجبات</th><th className="th" /></tr></thead>
          <tbody>
            {hotels.map((h) => (
              <tr key={h.id}>
                <td className="td font-bold">{h.localName ?? "—"}</td><td className="td ltr">{h.officialName}</td><td className="td">{CITY[h.city]}</td>
                <td className="td">{h.address}</td><td className="td ltr">{h.licenseNo}</td><td className="td">{h.mealsIncluded ? "نعم" : "لا"}</td>
                <td className="td">{w && <span className="flex gap-3"><a className="text-sm underline" href={`/hotels?edit=${h.id}`}>تعديل</a>
                  <form action={deleteHotel.bind(null, h.id)}><button className="text-sm text-red-700 underline">حذف</button></form></span>}</td>
              </tr>
            ))}
            {hotels.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={7}>لا توجد فنادق</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
