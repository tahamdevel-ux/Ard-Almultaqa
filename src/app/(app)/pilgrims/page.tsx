import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { GENDER_LABELS } from "@/lib/labels";

export default async function PilgrimsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePage("pilgrims.view");
  const { q = "" } = await searchParams;
  const term = q.trim();
  const where = term
    ? {
        deletedAt: null,
        OR: [
          { passportNo: { contains: term.replace(/\s+/g, "").toUpperCase() } },
          { phone: { contains: term.replace(/\D/g, "") || "__none__" } },
          ...term.split(/\s+/).map((w) => ({ OR: [
            { firstName: { contains: w } }, { fatherName: { contains: w } }, { grandfatherName: { contains: w } }, { familyName: { contains: w } },
            { enGivenName: { contains: w, mode: "insensitive" as const } }, { enSurname: { contains: w, mode: "insensitive" as const } },
            { enFatherName: { contains: w, mode: "insensitive" as const } },
          ] })),
        ],
      }
    : { deletedAt: null };
  const [rows, total] = await Promise.all([
    db.pilgrim.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { agent: true } }),
    db.pilgrim.count({ where: { deletedAt: null } }),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">المعتمرون <span className="text-sm font-normal text-brand-mid">({total})</span></h1>
        {can(user.role, "pilgrims.write") && <Link href="/pilgrims/new" className="btn">+ معتمر جديد</Link>}
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="بحث: رقم الجواز، الاسم بالعربي أو الإنكليزي، الهاتف" className="input" />
        <button className="btn-secondary">بحث</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">الاسم</th><th className="th">English</th><th className="th">الجواز</th><th className="th">الجنس</th><th className="th">الهاتف</th><th className="th">الوكيل</th><th className="th">انتهاء الجواز</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-canvas">
                <td className="td"><Link className="font-bold text-brand underline" href={`/pilgrims/${p.id}`}>{fullNameAr(p)}</Link></td>
                <td className="td ltr">{fullNameEn(p)}</td>
                <td className="td ltr">{p.passportNo}</td>
                <td className="td">{GENDER_LABELS[p.gender]}</td>
                <td className="td ltr">{p.phone}</td>
                <td className="td">{p.agent?.name}</td>
                <td className="td">{formatDate(p.passportExpiry)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-center text-brand-mid" colSpan={7}>لا توجد نتائج</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
