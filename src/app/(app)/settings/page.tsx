import { revalidatePath } from "next/cache";
import { requirePage, requirePermission } from "@/server/auth";
import { getSetting, setSetting } from "@/server/settings";

async function save(form: FormData) {
  "use server";
  await requirePermission("settings.manage");
  const s = (k: string) => String(form.get(k) ?? "").trim();
  await setSetting("company", { name: s("name"), address: s("address"), phones: s("phones") });
  await setSetting("passportMinMonths", Math.max(0, +s("passportMinMonths") || 6));
  await setSetting("mahram", { enabled: form.get("mahramEnabled") === "on", minAge: Math.max(0, +s("mahramMinAge") || 12) });
  await setSetting("usdRate", Math.max(1, +s("usdRate") || 1400));
  await setSetting("maxCompanionGroup", Math.max(2, +s("maxCompanionGroup") || 4));
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  await requirePage("settings.manage");
  const [company, months, mahram, maxGroup, usdRate] = await Promise.all([getSetting("company"), getSetting("passportMinMonths"), getSetting("mahram"), getSetting("maxCompanionGroup"), getSetting("usdRate")]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الإعدادات</h1>
      <form action={save} className="card grid gap-3 sm:grid-cols-2">
        <div><label className="label">اسم الشركة (يظهر في الطباعة)</label><input name="name" defaultValue={company.name} className="input" /></div>
        <div><label className="label">العنوان</label><input name="address" defaultValue={company.address} className="input" /></div>
        <div><label className="label">الهواتف</label><input name="phones" defaultValue={company.phones} className="input" dir="ltr" /></div>
        <div><label className="label">تنبيه انتهاء الجواز: أقل من (أشهر) بعد تاريخ العودة</label><input name="passportMinMonths" type="number" defaultValue={months} className="input" dir="ltr" /></div>
        <div><label className="label">أكبر عدد في العصبة</label><input name="maxCompanionGroup" type="number" defaultValue={maxGroup} className="input" dir="ltr" /></div>
        <div><label className="label">سعر الصرف المقترح (دينار لكل دولار) — يُعدَّل عند كل دفعة</label><input name="usdRate" type="number" defaultValue={usdRate} className="input" dir="ltr" /></div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="mahramEnabled" defaultChecked={mahram.enabled} /> تفعيل تنبيه «معتمرة بدون محرم»</label>
          <label className="label">الحد الأدنى للعمر</label><input name="mahramMinAge" type="number" defaultValue={mahram.minAge} className="input" dir="ltr" />
        </div>
        <div className="sm:col-span-2"><button className="btn">حفظ</button></div>
      </form>
    </div>
  );
}
