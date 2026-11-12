import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { GENDER_LABELS } from "@/lib/labels";
import { dateRangeLabel, tripLabel } from "@/lib/tripLabel";
import { Toast } from "@/components/Toast";
import { HeadTag } from "@/components/HeadTag";
import { roomLabel } from "@/domain/officeRooms";
import { addMonths } from "@/domain/dates";
import { getSetting } from "@/server/settings";
import { TRIP_ORDER } from "@/server/trips";
import { listQuery, nextSort, parseListParams, type PilgrimSort } from "@/domain/listParams";

const LIMIT = 300;

function SortTh({ col, lp, children }: { col: PilgrimSort; lp: ReturnType<typeof parseListParams>; children: React.ReactNode }) {
  const n = nextSort(lp, col), on = lp.sort === col;
  return (
    <th className="th md:sticky md:top-[3.75rem]" aria-sort={on ? (lp.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={`/pilgrims?${listQuery({ ...lp, ...n })}`} className="inline-flex items-center gap-1 hover:underline">{children}<span aria-hidden="true" className="text-xs">{on ? (lp.dir === "asc" ? "▲" : "▼") : "↕"}</span></Link>
    </th>
  );
}

export default async function PilgrimsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("pilgrims.view");
  const sp = await searchParams;
  const saved = sp.saved;
  const lp = parseListParams(sp);
  const { q, room } = lp;
  const canMoney = can(user.role, "payments.view");
  const showRooms = can(user.role, "officeRooms.view");
  const roomMatch = /^([a-z]{0,2})(\d+)$/i.exec(room.trim());
  const listUrl = "/pilgrims" + (listQuery(lp) ? `?${listQuery(lp)}` : ""); // where the user is: Save returns here
  const rt = `returnTo=${encodeURIComponent(listUrl)}`;
  const savedPilgrim = saved ? await db.pilgrim.findUnique({ where: { id: saved } }) : null;
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
  // optional filter by office room (e.g. a12 or 3): pilgrims with an active booking in that room
  const roomFilter = showRooms && roomMatch ? { bookings: { some: { status: "ACTIVE" as const, deletedAt: null, officeMember: { officeRoom: { code: roomMatch[1] ? roomMatch[1].toLowerCase() : null, seq: Number(roomMatch[2]) } } } } } : {};
  // filters: only the booking-based ones need an ACTIVE booking on a live trip
  const live = { status: "ACTIVE" as const, deletedAt: null, trip: { deletedAt: null } };
  const minMonths = await getSetting("passportMinMonths");
  const extra: object[] = [];
  if (lp.trip) extra.push({ bookings: { some: { ...live, tripId: lp.trip } } });
  if (lp.agent) extra.push({ agentId: lp.agent });
  if (lp.f === "expiring") extra.push({ passportExpiry: { lt: addMonths(new Date(), minMonths) }, bookings: { some: { ...live, trip: { deletedAt: null, archivedAt: null, status: { in: ["OPEN", "FULL", "TRAVELLING"] as ("OPEN" | "FULL" | "TRAVELLING")[] } } } } });
  if (lp.f === "noroom" && showRooms) extra.push({ bookings: { some: { ...live, officeMember: null } } });
  if (lp.f === "noprice" && canMoney) extra.push({ bookings: { some: { ...live, priceAmount: null } } });
  const dir = lp.dir;
  const orderBy = lp.sort === "name" ? [{ firstName: dir }, { fatherName: dir }] : lp.sort === "passport" ? [{ passportNo: dir }] : lp.sort === "expiry" ? [{ passportExpiry: dir }] : [{ createdAt: dir }];
  const [rows, total, tripOpts, agentOpts] = await Promise.all([
    db.pilgrim.findMany({
      where: { ...where, ...roomFilter, ...(extra.length ? { AND: extra } : {}) }, orderBy: orderBy as never, take: LIMIT + 1,
      include: { agent: true, bookings: { where: { status: "ACTIVE", deletedAt: null, trip: { deletedAt: null } }, include: { trip: true, groups: true, officeMember: { include: { officeRoom: true } } } } },
    }),
    db.pilgrim.count({ where: { deletedAt: null } }),
    db.trip.findMany({ where: { deletedAt: null, archivedAt: null }, orderBy: TRIP_ORDER, select: { id: true, tripNo: true, name: true } }),
    db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
    // newest created trip first (same order as everywhere else); ties by id
    return b.trip.createdAt.getTime() - a.trip.createdAt.getTime() || (a.trip.id < b.trip.id ? 1 : -1);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">المعتمرون <span className="text-sm font-normal text-brand-mid">({total})</span></h1>
        {can(user.role, "pilgrims.write") && <Link href={`/pilgrims/new?${rt}`} className="btn">+ معتمر جديد</Link>}
      </div>
      {savedPilgrim && <Toast text={`تم حفظ ${fullNameAr(savedPilgrim)}`} />}
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="بحث: رقم الجواز، الاسم بالعربي أو الإنكليزي، الهاتف" aria-label="بحث" className="input min-w-[12rem] flex-1" />
        {showRooms && <input name="room" defaultValue={room} placeholder="غرفة المكتب (مثل a12)" aria-label="غرفة المكتب" className="input w-44" dir="ltr" />}
        <select name="trip" aria-label="الرحلة" defaultValue={lp.trip} className="input w-48"><option value="">كل الرحلات</option>{tripOpts.map((t) => <option key={t.id} value={t.id}>{t.tripNo ?? t.name}</option>)}</select>
        <select name="agent" aria-label="الوكيل" defaultValue={lp.agent} className="input w-44"><option value="">كل الوكلاء</option>{agentOpts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {lp.f && <input type="hidden" name="f" value={lp.f} />}{lp.sort !== "new" && <><input type="hidden" name="sort" value={lp.sort} /><input type="hidden" name="dir" value={lp.dir} /></>}
        <button className="btn-secondary">بحث</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="تصفية سريعة">
        {([["", "الكل"], ["expiring", "جوازات تنتهي قريباً"], ...(showRooms ? [["noroom", "بلا غرفة"]] : []), ...(canMoney ? [["noprice", "بلا سعر"]] : [])] as [string, string][]).map(([v, l]) => (
          <Link key={v} href={`/pilgrims?${listQuery({ ...lp, f: v as never })}`} aria-current={lp.f === v ? "true" : undefined}
            className={"rounded-full border px-3 py-1 font-bold " + (lp.f === v ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark hover:bg-canvas")}>{l}</Link>
        ))}
        {(lp.f || lp.trip || lp.agent || q || room || lp.sort !== "new") && <Link href="/pilgrims" className="text-brand-mid underline">مسح الكل</Link>}
      </div>
      <div className="card overflow-x-auto p-0 md:overflow-visible">
        <table className="w-full">
          <thead><tr>
            <SortTh col="name" lp={lp}>الاسم</SortTh><th className="th md:sticky md:top-[3.75rem]">English</th><SortTh col="passport" lp={lp}>الجواز</SortTh>
            <th className="th md:sticky md:top-[3.75rem]">الجنس</th><th className="th md:sticky md:top-[3.75rem]">الهاتف</th><th className="th md:sticky md:top-[3.75rem]">الوكيل</th><SortTh col="expiry" lp={lp}>انتهاء الجواز</SortTh>
          </tr></thead>
          {ordered.map((g) => (
            <tbody key={g.trip?.id ?? "none"}>
              <tr className="bg-brand-light">
                <th colSpan={7} className="px-3 py-2 text-start text-sm font-bold text-brand-dark">
                  {g.trip ? (<><Link className="underline" href={`/trips/${g.trip.id}`}>{tripLabel(g.trip)}</Link> <span className="font-normal text-brand-mid">· {dateRangeLabel(g.trip.departDate, g.trip.returnDate)}</span></>) : "بدون رحلة"}
                  <span className="ms-2 font-normal text-brand-mid">({g.list.length})</span>
                </th>
              </tr>
              {g.list.map((p) => (
                <tr key={p.id} className={"hover:bg-canvas " + (p.id === saved ? "saved-row" : "")}>
                  <td className="td"><Link className="font-bold text-brand underline" href={`/pilgrims/${p.id}?${rt}`}>{fullNameAr(p)}</Link>{p.bookings.find((b) => b.tripId === g.trip?.id)?.groups.some((x) => x.isHead) && <HeadTag />}{showRooms && (() => { const r = p.bookings.find((b) => b.tripId === g.trip?.id)?.officeMember?.officeRoom; return r ? <span className="chip chip-gray ms-2" title="غرفة المكتب" dir="ltr">{roomLabel(r)}</span> : null; })()}</td>
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
