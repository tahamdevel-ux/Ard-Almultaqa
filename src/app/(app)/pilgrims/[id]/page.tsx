import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PilgrimForm } from "@/components/PilgrimForm";
import { DocUpload } from "@/components/DocUpload";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { passportExpiryWarning } from "@/domain/passport";
import { mahramWarning, ageOn } from "@/domain/mahram";
import { getSetting } from "@/server/settings";
import { DOC_LABELS, TRANSPORT_LABELS, TRIP_STATUS_LABELS, VISA_LABELS } from "@/lib/labels";
import { removeDocument, savePilgrim, uploadDocument } from "../actions";

export default async function PilgrimPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("pilgrims.view");
  const { id } = await params;
  const p = await db.pilgrim.findFirst({
    where: { id, deletedAt: null },
    include: { documents: true, mahram: true, bookings: { include: { trip: true, seat: { include: { bus: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!p) notFound();
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const [minMonths, mahramSettings] = await Promise.all([getSetting("passportMinMonths"), getSetting("mahram")]);
  const canWrite = can(user.role, "pilgrims.write");
  const canHealth = can(user.role, "pilgrims.health");
  const canDocs = can(user.role, "documents.view");

  const warnings: string[] = [];
  for (const b of p.bookings.filter((b) => b.status === "ACTIVE")) {
    const w = passportExpiryWarning(p.passportExpiry, b.trip.returnDate, minMonths);
    if (w) warnings.push(`${w} (رحلة ${b.trip.tripNo})`);
  }
  const mw = mahramWarning(
    { gender: p.gender, age: ageOn(p.birthDate, new Date()), hasMahram: !!p.mahramId, inCompanionGroup: false, familyHasAdultMale: false },
    mahramSettings,
  );
  if (mw) warnings.push(mw);

  const values = {
    ...p,
    mahramPassport: p.mahram?.passportNo ?? "",
    birthDate: formatDate(p.birthDate), passportIssue: formatDate(p.passportIssue), passportExpiry: formatDate(p.passportExpiry),
  } as unknown as Record<string, string | boolean | null>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{fullNameAr(p)}</h1>
        <p className="ltr text-sm text-brand-mid">{fullNameEn(p)} — {p.passportNo}</p>
      </div>
      {warnings.map((w) => <p key={w} className="alert-warn">⚠ {w}</p>)}

      <section className="card">
        <h2 className="mb-3 font-bold">المستمسكات</h2>
        {canDocs ? (
          <div className="space-y-3">
            {(["PASSPORT", "PHOTO", "NATIONAL_ID", "OTHER"] as const).map((type) => {
              const docs = p.documents.filter((d) => d.type === type);
              return (
                <div key={type} className="rounded border border-line p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                    {DOC_LABELS[type]}
                    <span className={"chip " + (docs.length ? "chip-ok" : "chip-bad")}>{docs.length ? "مرفوع" : "ناقص"}</span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {docs.map((d) => (
                      <div key={d.id} className="text-xs">
                        {d.mime.startsWith("image/")
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <a href={`/api/documents/${d.id}`} target="_blank"><img src={`/api/documents/${d.id}`} alt={DOC_LABELS[type]} className="h-24 rounded border" /></a>
                          : <a className="underline" href={`/api/documents/${d.id}`} target="_blank">ملف PDF</a>}
                        {can(user.role, "documents.write") && (
                          <form action={removeDocument.bind(null, d.id)}><button className="text-red-700 underline">حذف</button></form>
                        )}
                      </div>
                    ))}
                  </div>
                  {can(user.role, "documents.write") && <DocUpload action={uploadDocument.bind(null, p.id, type)} label="رفع" />}
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-brand-mid">لا تملك صلاحية عرض المستمسكات</p>}
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">الرحلات</h2>
        <table className="w-full">
          <thead><tr><th className="th">الرحلة</th><th className="th">النوع</th><th className="th">الذهاب</th><th className="th">العودة</th><th className="th">الحالة</th><th className="th">المقعد</th><th className="th">التأشيرة</th></tr></thead>
          <tbody>
            {p.bookings.map((b) => (
              <tr key={b.id}>
                <td className="td"><Link className="underline" href={`/trips/${b.tripId}`}>{b.trip.tripNo} - {b.trip.name}</Link></td>
                <td className="td">{TRANSPORT_LABELS[b.trip.transportType]}</td>
                <td className="td">{formatDate(b.trip.departDate)}</td>
                <td className="td">{formatDate(b.trip.returnDate)}</td>
                <td className="td">{TRIP_STATUS_LABELS[b.trip.status]}</td>
                <td className="td">{b.seat?.bus ? `باص ${b.seat.bus.number} / ${b.seat.seatNo}` : b.seat?.ticketNo ?? "—"}</td>
                <td className="td">{VISA_LABELS[b.visaStatus]}</td>
              </tr>
            ))}
            {p.bookings.length === 0 && <tr><td className="td text-brand-mid" colSpan={7}>لم يُحجز في أي رحلة</td></tr>}
          </tbody>
        </table>
      </section>

      {canWrite ? (
        <details className="card" open>
          <summary className="cursor-pointer font-bold">تعديل البيانات</summary>
          <div className="mt-3">
            <PilgrimForm action={savePilgrim.bind(null, p.id)} values={values} agents={agents} canHealth={canHealth} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
