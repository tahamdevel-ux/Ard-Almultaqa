import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { GENDER_LABELS } from "@/lib/labels";
import { dateRangeLabel, tripLabel } from "@/lib/tripLabel";

const LIMIT = 300;

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
    db.pilgrim.findMany({
      where, orderBy: { createdAt: "desc" }, take: LIMIT + 1,
      include: { agent: true, bookings: { where: { status: "ACTIVE", deletedAt: null, trip: { deletedAt: null } }, include: { trip: true } } },
    }),
    db.pilgrim.count({ where: { deletedAt: null } }),
  ]);
  const truncated = rows.length > LIMIT;
  const shown = rows.slice(0, LIMIT);
  // one section per trip (a pilgrim on two trips appears under both); pilgrims without a trip last
  type Row = (typeof shown)[number];
  const groups = new Map<string, { trip: Row["bookings"][number]["trip"] | null; list: Row[] }>();
  for (const p of shown) {
    const trips = p.bookings.length ? p.bookings.map((b) => b.trip) : [null];
    for (const t of trips) {
      const g = groups.get(t?.id ?? "none") ?? { trip: t, list: [] };
      g.list.push(p); groups.set(t?.id ?? "none", g);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (!a.trip) return 1; if (!b.trip) return -1;
    const da = a.trip.departDate?.getTime() ?? null, db_ = b.trip.departDate?.getTime() ?? null;
    if (da == null && db_ == null) return a.trip.name.localeCompare(b.trip.name, "ar");
    if (da == null) return 1; if (db_ == null) return -1;
    return db_ - da;
  });
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
          {ordered.map((g) => (
            <tbody key={g.trip?.id ?? "none"}>
              <tr className="bg-brand-light">
                <th colSpan={7} className="px-3 py-2 text-start text-sm font-bold text-brand-dark">
                  {g.trip ? (<><Link className="underline" href={`/trips/${g.trip.id}`}>{tripLabel(g.trip)}</Link> <span className="font-normal text-brand-mid">· {dateRangeLabel(g.trip.departDate, g.trip.returnDate)}</span></>) : "بدون رحلة"}
                  <span className="ms-2 font-normal text-brand-mid">({g.list.length})</span>
                </th>
              </tr>
              {g.list.map((p) => (
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
            </tbody>
          ))}
          {ordered.length === 0 && <tbody><tr><td className="td text-center text-brand-mid" colSpan={7}>لا توجد نتائج</td></tr></tbody>}
        </table>
      </div>
      {truncated && <p className="text-sm text-brand-mid">عُرض أحدث {LIMIT} معتمر فقط — استخدم البحث لتضييق النتائج.</p>}
    </div>
  );
}
