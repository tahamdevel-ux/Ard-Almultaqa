import { notFound } from "next/navigation";
import { effectiveMode, transportText } from "@/domain/transport";
import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { PilgrimForm } from "@/components/PilgrimForm";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { busLabel, dateOrNotSet, tripLabel } from "@/lib/tripLabel";
import { passportExpiryWarning } from "@/domain/passport";
import { mahramWarning, ageOn } from "@/domain/mahram";
import { getSetting } from "@/server/settings";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";
import { roomLabel } from "@/domain/officeRooms";
import { safeReturnTo } from "@/lib/returnTo";
import { savePilgrim, addToTrips } from "../actions";
import { AddToTripsForm } from "@/components/TripPicker";
import { hotelOptions, tripChoices } from "@/server/trips";

export default async function PilgrimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const user = await requirePage("pilgrims.view");
  const { id } = await params;
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const p = await db.pilgrim.findFirst({
    where: { id, deletedAt: null },
    include: { mahram: true, bookings: { include: { trip: true, seat: { include: { bus: true, car: true, flight: true } }, officeMember: { include: { officeRoom: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!p) notFound();
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const [minMonths, mahramSettings] = await Promise.all([getSetting("passportMinMonths"), getSetting("mahram")]);
  const canWrite = can(user.role, "pilgrims.write");
  const canOffice = can(user.role, "officeRooms.view");
  const canBook = can(user.role, "bookings.write");
  const hotels = canBook ? await hotelOptions() : [];
  const addable = canBook ? await tripChoices(p.bookings.filter((b) => b.status === "ACTIVE").map((b) => b.tripId)) : [];
  const canHealth = can(user.role, "pilgrims.health");

  const warnings: string[] = [];
  for (const b of p.bookings.filter((b) => b.status === "ACTIVE")) {
    const w = passportExpiryWarning(p.passportExpiry, b.trip.returnDate, minMonths);
    if (w) warnings.push(`${w} (رحلة ${tripLabel(b.trip)})`);
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
        <h2 className="mb-3 font-bold">الرحلات</h2>
        <table className="w-full">
          <thead><tr><th className="th">الرحلة</th><th className="th">النوع</th><th className="th">الذهاب</th><th className="th">العودة</th><th className="th">الحالة</th><th className="th">المقعد</th>{canOffice && <th className="th">غرفة المكتب</th>}</tr></thead>
          <tbody>
            {p.bookings.map((b) => (
              <tr key={b.id} data-href={`/bookings/${b.id}`}>
                <td className="td"><Link className="underline" href={`/trips/${b.tripId}`}>{tripLabel(b.trip)}</Link></td>
                <td className="td">{TRANSPORT_LABELS[b.trip.transportType]}</td>
                <td className="td">{dateOrNotSet(b.trip.departDate)}</td>
                <td className="td">{dateOrNotSet(b.trip.returnDate)}</td>
                <td className="td">{TRIP_STATUS_LABELS[b.trip.status]}</td>
                <td className="td">{transportText(effectiveMode(b.transport, b.trip.transportType), b.seat)}</td>
                {canOffice && <td className="td" dir="ltr">{b.status === "ACTIVE" && b.officeMember ? roomLabel(b.officeMember.officeRoom) : "—"}</td>}
              </tr>
            ))}
            {p.bookings.length === 0 && <tr><td className="td text-brand-mid" colSpan={canOffice ? 7 : 6}>لم يُحجز في أي رحلة</td></tr>}
          </tbody>
        </table>
      </section>

      {canBook && (
        <details className="card">
          <summary className="cursor-pointer font-bold">إضافة لرحلة</summary>
          <div className="mt-3"><AddToTripsForm action={addToTrips.bind(null, p.id)} trips={addable} hotels={hotels} /></div>
        </details>
      )}

      {canWrite ? (
        <details className="card" open>
          <summary className="cursor-pointer font-bold">تعديل البيانات</summary>
          <div className="mt-3">
            <PilgrimForm action={savePilgrim.bind(null, p.id)} values={values} agents={agents} canHealth={canHealth} returnTo={returnTo} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
