import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip, loadTripDetail } from "@/server/trips";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { SmallForm } from "@/components/SmallForm";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS, VISA_LABELS } from "@/lib/labels";
import { db } from "@/server/db";
import { saveTripPrices } from "../../bookings/[id]/actions";
import { balance, formatMoney } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { saveAsProgram, setTripHotels, addBooking, addBus, addCar, addFlight, createCompanionGroup, dissolveGroup, removeBooking, setAirAssignment, setVisa } from "../actions";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("trips.view");
  const { id } = await params;
  const d = await loadTripDetail(id);
  if (!d) notFound();
  const { trip, rows, counter } = d;
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const w = can(user.role, "trips.write"), bw = can(user.role, "bookings.write"), sw = can(user.role, "seats.write");
  const groups = new Map<string, { kind: string; members: string[] }>();
  for (const r of rows) for (const g of r.booking.groups) {
    const e = groups.get(g.groupId) ?? { kind: g.group.kind, members: [] };
    e.members.push(r.booking.pilgrim.firstName + " " + r.booking.pilgrim.familyName);
    groups.set(g.groupId, e);
  }
  const hotels = w ? await db.hotel.findMany({ where: { deletedAt: null }, orderBy: { officialName: "asc" } }) : [];
  const hotelName = (h?: { localName: string | null; officialName: string } | null) => (h ? h.localName ?? h.officialName : "—");
  const mk = trip.makkahHotelId ? await db.hotel.findUnique({ where: { id: trip.makkahHotelId } }) : null;
  const md = trip.madinahHotelId ? await db.hotel.findUnique({ where: { id: trip.madinahHotelId } }) : null;
  const money = can(user.role, "payments.view"), pw = can(user.role, "prices.write");
  const prices = money ? await db.tripPrice.findMany({ where: { tripId: trip.id } }) : [];
  const groupOf = (r: (typeof rows)[number]) => r.booking.groups[0]?.groupId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{trip.tripNo} — {trip.name}</h1>
          <p className="text-sm text-gray-600">{TRANSPORT_LABELS[trip.transportType]} · {formatDate(trip.departDate)} ← {formatDate(trip.returnDate)} · {TRIP_STATUS_LABELS[trip.status]}{trip.supervisor && ` · المشرف: ${trip.supervisor.name}`}</p>
        </div>
        {can(user.role, "outputs.view") && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="btn" href={`/trips/${trip.id}/rooming`}>التسكين</Link>
            <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/missing?format=pdf`}>قائمة النواقص PDF</a>
            <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/missing?format=xlsx`}>Excel</a>
            <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/id-cards?format=pdf`}>بطاقات المعتمرين PDF</a>
            {trip.transportType === "LAND" && trip.buses.map((b) => (
              <span key={b.id} className="flex gap-1">
                <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/manifest?bus=${b.id}&format=pdf`}>كشف باص {b.number} PDF</a>
                <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/manifest?bus=${b.id}&format=xlsx`}>Excel</a>
              </span>
            ))}
            {trip.transportType === "AIR" && (
              <>
                <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/flight-list?format=pdf`}>قائمة الطيران PDF</a>
                <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/flight-list?format=xlsx`}>Excel</a>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["المسجّلون", `${counter.registered} / ${counter.capacity}`, counter.over ? "chip-bad" : "chip-ok"], ["الجاهزون", String(counter.ready), "chip-ok"], ["النواقص", String(counter.missing), counter.missing ? "chip-warn" : "chip-ok"], ["الشواغر", String(counter.free), "chip-gray"]].map(([l, v, c]) => (
          <div key={l} className="card text-center"><div className="text-xs text-gray-600">{l}</div><div className={"chip mt-1 text-base " + c}>{v}</div></div>
        ))}
      </div>
      {counter.over && <p className="rounded bg-red-50 p-2 text-sm font-bold text-red-800">⚠ عدد المسجلين تجاوز السعة القصوى للرحلة</p>}

      <section className="card space-y-2">
        <h2 className="font-bold">الفنادق والإقامة</h2>
        <p className="text-sm">مكة: <b>{hotelName(mk)}</b> ({trip.nightsMakkah} ليالي) · المدينة: <b>{hotelName(md)}</b> ({trip.nightsMadinah} ليالي) · البداية من: {trip.firstCity === "MAKKAH" ? "مكة" : "المدينة"}</p>
        {w && (
          <form action={setTripHotels.bind(null, trip.id)} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <select name="madinahHotelId" defaultValue={trip.madinahHotelId ?? ""} className="input" aria-label="فندق المدينة"><option value="">فندق المدينة</option>{hotels.filter((h) => h.city === "MADINAH").map((h) => <option key={h.id} value={h.id}>{hotelName(h)}</option>)}</select>
            <select name="makkahHotelId" defaultValue={trip.makkahHotelId ?? ""} className="input" aria-label="فندق مكة"><option value="">فندق مكة</option>{hotels.filter((h) => h.city === "MAKKAH").map((h) => <option key={h.id} value={h.id}>{hotelName(h)}</option>)}</select>
            <select name="firstCity" defaultValue={trip.firstCity} className="input" aria-label="المدينة الأولى"><option value="MADINAH">نبدأ بالمدينة</option><option value="MAKKAH">نبدأ بمكة</option></select>
            <input name="nightsMadinah" type="number" defaultValue={trip.nightsMadinah} className="input" dir="ltr" aria-label="ليالي المدينة" />
            <input name="nightsMakkah" type="number" defaultValue={trip.nightsMakkah} className="input" dir="ltr" aria-label="ليالي مكة" />
            <button className="btn">حفظ</button>
          </form>
        )}
        {can(user.role, "programs.write") && <form action={saveAsProgram.bind(null, trip.id)}><button className="text-sm underline">حفظ هذه الرحلة كقالب</button></form>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">{trip.transportType === "LAND" ? "الباصات" : "الطيران والسيارات"}</h2>
        {trip.transportType === "LAND" ? (
          <>
            <ul className="space-y-1 text-sm">
              {trip.buses.map((b) => (
                <li key={b.id}>
                  <Link className="font-bold text-brand underline" href={`/trips/${trip.id}/bus/${b.id}`}>باص {b.number}</Link>
                  {" "}— {b.seatCount} مقعد · {b.driverName} <span className="ltr">{b.driverPhone}</span> · {b.company}
                </li>
              ))}
            </ul>
            {w && <SmallForm action={addBus.bind(null, trip.id)} submit="إضافة باص" fields={[{ name: "number", label: "رقم الباص", required: true }, { name: "seatCount", label: "عدد المقاعد", ltr: true, type: "number" }, { name: "driverName", label: "السائق" }, { name: "driverPhone", label: "هاتف السائق", ltr: true }, { name: "company", label: "شركة النقل" }]} />}
          </>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {trip.flights.map((f) => <li key={f.id}>✈ <span className="ltr">{f.flightNo}</span> {f.airline} · {f.ticketCount} تذكرة · {f.departAt?.toLocaleString("en-GB", { timeZone: "Asia/Baghdad" })}</li>)}
              {trip.cars.map((c) => <li key={c.id}>🚗 {c.label} — {c.driverName} <span className="ltr">{c.driverPhone}</span> ({c.capacity} ركاب)</li>)}
            </ul>
            {w && (
              <div className="space-y-2">
                <SmallForm action={addFlight.bind(null, trip.id)} submit="إضافة رحلة جوية" fields={[{ name: "flightNo", label: "رقم الرحلة", ltr: true, required: true }, { name: "airline", label: "الشركة" }, { name: "departAt", label: "الإقلاع", type: "datetime-local", ltr: true }, { name: "arriveAt", label: "الوصول", type: "datetime-local", ltr: true }, { name: "ticketCount", label: "عدد التذاكر", type: "number", ltr: true }]} />
                <SmallForm action={addCar.bind(null, trip.id)} submit="إضافة سيارة" fields={[{ name: "label", label: "السيارة", required: true }, { name: "driverName", label: "السائق" }, { name: "driverPhone", label: "هاتف", ltr: true }, { name: "capacity", label: "الركاب", type: "number", ltr: true }]} />
              </div>
            )}
          </>
        )}
      </section>

      {money && (
        <section className="card space-y-2">
          <h2 className="font-bold">أسعار الرحلة (بالدولار، حسب نوع الغرفة)</h2>
          {pw ? (
            <form action={saveTripPrices.bind(null, trip.id)} className="flex flex-wrap items-end gap-2">
              {(["DOUBLE", "TRIPLE", "QUAD", "QUINT"] as const).map((t) => (
                <div key={t}><label className="label" htmlFor={"price-" + t}>{ROOM_TYPE_LABELS[t]}</label>
                  <input id={"price-" + t} name={t} type="number" min={0} defaultValue={prices.find((p) => p.roomType === t)?.amount ?? ""} className="input w-28" dir="ltr" /></div>
              ))}
              <button className="btn">حفظ الأسعار</button>
            </form>
          ) : <p className="text-sm">{prices.map((p) => `${ROOM_TYPE_LABELS[p.roomType]}: ${formatMoney(p.amount, p.currency)}`).join(" · ") || "غير محددة"}</p>}
        </section>
      )}

      {bw && (
        <section className="card">
          <h2 className="mb-2 font-bold">إضافة معتمر للرحلة</h2>
          <SmallForm action={addBooking.bind(null, trip.id)} submit="إضافة" fields={[{ name: "passportNo", label: "رقم الجواز", ltr: true, required: true }]} />
        </section>
      )}

      <form id="groupform" action={createCompanionGroup.bind(null, trip.id)} />
      <section className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <h2 className="font-bold">المعتمرون ({rows.length})</h2>
          {bw && (
            <div className="flex items-center gap-2 text-sm">
              <select form="groupform" name="kind" className="input w-auto"><option value="COMPANIONS">عصبة</option><option value="FAMILY">عائلة</option></select>
              <button form="groupform" className="btn-secondary">اجعل المحددين مجموعة واحدة</button>
            </div>
          )}
        </div>
        <table className="w-full">
          <thead><tr><th className="th" />{["الاسم", "الجواز", "المجموعة", "المستمسكات", "التأشيرة", "المقعد / التذكرة", ...(money ? ["السعر", "المتبقي"] : []), "تنبيهات", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const b = r.booking, gid = groupOf(r);
              return (
                <tr key={b.id}>
                  <td className="td">{bw && <input form="groupform" type="checkbox" name="bookingIds" value={b.id} aria-label="تحديد" />}</td>
                  <td className="td"><Link className="font-bold underline" href={`/pilgrims/${b.pilgrimId}`}>{fullNameAr(b.pilgrim)}</Link></td>
                  <td className="td ltr">{b.pilgrim.passportNo}</td>
                  <td className="td">{gid ? <span className="chip chip-gray">{groups.get(gid)!.kind === "COMPANIONS" ? "عصبة" : "عائلة"} ({groups.get(gid)!.members.length})</span> : ""}</td>
                  <td className="td">{r.ready ? <span className="chip chip-ok mb-1">جاهز للسفر</span> : null}{r.missing.filter((m) => m.startsWith("ناقص")).length ? <span className="chip chip-bad">{r.missing.filter((m) => m.startsWith("ناقص")).join("، ")}</span> : <span className="chip chip-ok">مكتملة</span>}</td>
                  <td className="td">
                    {bw ? (
                      <form action={setVisa.bind(null, trip.id, b.id)} className="flex gap-1">
                        <select name="visaStatus" defaultValue={b.visaStatus} className="input w-28 py-1">{Object.entries(VISA_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        <input name="visaNo" defaultValue={b.visaNo ?? ""} dir="ltr" placeholder="رقم التأشيرة" className="input w-28 py-1" />
                        <input name="visaIssue" defaultValue={formatDate(b.visaIssue)} dir="ltr" placeholder="إصدار" className="input w-24 py-1" aria-label="تاريخ إصدار التأشيرة" />
                        <input name="visaExpiry" defaultValue={formatDate(b.visaExpiry)} dir="ltr" placeholder="انتهاء" className="input w-24 py-1" aria-label="تاريخ انتهاء التأشيرة" />
                        <button className="btn-secondary py-1">حفظ</button>
                      </form>
                    ) : VISA_LABELS[b.visaStatus]}
                  </td>
                  <td className="td">
                    {trip.transportType === "LAND"
                      ? (b.seat?.seatNo ? `باص ${b.seat.bus?.number} / ${b.seat.seatNo}` : <span className="chip chip-warn">بلا مقعد</span>)
                      : sw ? (
                        <form action={setAirAssignment.bind(null, trip.id, b.id)} className="flex gap-1">
                          <input name="ticketNo" defaultValue={b.seat?.ticketNo ?? ""} dir="ltr" placeholder="رقم التذكرة" className="input w-32 py-1" />
                          <select name="carId" defaultValue={b.seat?.carId ?? ""} className="input w-28 py-1"><option value="">سيارة</option>{trip.cars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                          <button className="btn-secondary py-1">حفظ</button>
                        </form>
                      ) : b.seat?.ticketNo}
                  </td>
                  {money && (() => {
                    const bal = balance(b.priceAmount, b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) })));
                    return (<>
                      <td className="td">{b.priceAmount == null ? <span className="chip chip-warn">بلا سعر</span> : formatMoney(b.priceAmount, b.priceCurrency)}</td>
                      <td className="td"><Link className={"underline " + ((bal ?? 0) > 0 ? "text-red-700 font-bold" : "")} href={`/bookings/${b.id}`}>{bal == null ? "الحساب" : formatMoney(bal, b.priceCurrency)}</Link></td>
                    </>);
                  })()}
                  <td className="td space-y-0.5 text-xs text-amber-800">{r.warnings.map((x) => <div key={x}>⚠ {x}</div>)}</td>
                  <td className="td">
                    {gid && bw && <form action={dissolveGroup.bind(null, trip.id, gid)}><button className="text-xs underline">فك المجموعة</button></form>}
                    {bw && <form action={removeBooking.bind(null, trip.id, b.id)}><button className="text-xs text-red-700 underline">إزالة</button></form>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
