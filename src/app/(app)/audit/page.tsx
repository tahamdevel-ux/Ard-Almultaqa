import { db } from "@/server/db";
import { requirePage } from "@/server/auth";

const FIELD_LABELS: Record<string, string> = {
  firstName: "الاسم الأول", fatherName: "اسم الأب", grandfatherName: "اسم الجد", greatGrandfatherName: "أبو الجد", familyName: "اللقب",
  passportNo: "رقم الجواز", enGivenName: "Given name", enFatherName: "Father name", enGrandfatherName: "Grandfather name", enSurname: "Surname",
  nationality: "الجنسية", placeOfBirth: "محل الولادة", passportIssue: "إصدار الجواز", passportExpiry: "انتهاء الجواز",
  passportAuthority: "جهة الإصدار", birthDate: "تاريخ الميلاد", gender: "الجنس", phone: "الهاتف",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePage("audit.view");
  const { q = "" } = await searchParams;
  const rows = await db.auditLog.findMany({
    where: q ? { OR: [{ entityId: q }, { oldValue: { contains: q } }, { newValue: { contains: q } }, { userName: { contains: q } }] } : {},
    orderBy: { at: "desc" }, take: 200,
  });
  return (
    <div className="space-y-4">
      <h1 className="page-title">سجل التعديلات</h1>
      <form className="flex gap-2"><input name="q" defaultValue={q} className="input" placeholder="بحث بالقيمة أو المستخدم أو معرّف السجل" /><button className="btn-secondary">بحث</button></form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الوقت</th><th className="th">المستخدم</th><th className="th">السجل</th><th className="th">الحقل</th><th className="th">القيمة القديمة</th><th className="th">القيمة الجديدة</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="td ltr">{r.at.toLocaleString("en-GB", { timeZone: "Asia/Baghdad" })}</td>
                <td className="td">{r.userName ?? "—"}</td>
                <td className="td">{r.entity}</td>
                <td className="td">{FIELD_LABELS[r.field] ?? r.field}</td>
                <td className="td">{r.oldValue ?? "—"}</td><td className="td">{r.newValue ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={6}>لا توجد تعديلات</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
