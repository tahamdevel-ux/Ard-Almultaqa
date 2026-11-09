import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip, loadTripDetail } from "@/server/trips";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { busLabel, dateRangeLabel, tripLabel } from "@/lib/tripLabel";
import { DeleteBusButton } from "@/components/BusTools";
import { AddPilgrimDialog } from "@/components/AddPilgrimDialog";
import { AccommodationEditor, type HotelOpt } from "@/components/AccommodationFields";
import { SmallForm } from "@/components/SmallForm";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";
import { db } from "@/server/db";
import { saveTripPrices } from "../../bookings/[id]/actions";
import { balance, formatMoney } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { updateTripBasics, saveAsProgram, setTripHotels, addBus, addCar, addFlight, createCompanionGroup, setFamilyHead, dissolveGroup, removeBooking, setAirAssignment, setAccommodation } from "../actions";
import { DateInput } from "@/components/DateInput";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("trips.view");
  const { id } = await params;
  const d = await loadTripDetail(id);
  if (!d) notFound();
  const { trip, rows, counter } = d;
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const w = can(user.role, "trips.write"), bw = can(user.role, "bookings.write"), sw = can(user.role, "seats.write");
  const groups = new Map<string, { kind: string; members: string[]; head?: string }>();
  for (const r of rows) for (const g of r.booking.groups) {
    const e = groups.get(g.groupId) ?? { kind: g.group.kind, members: [] };
    if (g.isHead) e.head = r.booking.id;
    e.members.push(r.booking.pilgrim.firstName + " " + r.booking.pilgrim.familyName);
    groups.set(g.groupId, e);
  }
  const hotels = w || bw || can(user.role, "rooming.write") ? await db.hotel.findMany({ where: { deletedAt: null }, orderBy: { officialName: "asc" } }) : [];
  const hotelOpts: HotelOpt[] = hotels.map((h) => ({ id: h.id, name: h.localName ?? h.officialName, city: h.city }));
  const accWrite = bw || can(user.role, "rooming.write");
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
          <h1 className="page-title">{tripLabel(trip)}</h1>
          <p className="text-sm text-brand-mid">{TRANSPORT_LABELS[trip.transportType]} · {dateRangeLabel(trip.departDate, trip.returnDate)} · {TRIP_STATUS_LABELS[trip.status]}{trip.supervisor && ` · المشرف: ${trip.supervisor.name}`}</p>
        </div>
        {can(user.role, "outputs.view") && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="btn" href={`/trips/${trip.id}/rooming`}>التسكين</Link>
            {trip.transportType === "LAND" && trip.buses.map((b) => (
              <span key={b.id} className="flex gap-1">
                <a className="btn-secondary" href={`/api/trips/${trip.id}/outputs/manifest?bus=${b.id}&format=pdf`}>كشف {busLabel(b)} PDF</a>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[["المسجّلون", `${counter.registered} من ${counter.capacity}`, counter.over ? "chip-bad" : "chip-ok"], ["الجاهزون", String(counter.ready), "chip-ok"], ["الشواغر", String(counter.free), "chip-gray"]].map(([l, v, c]) => (
          <div key={l} className="card text-center"><div className="text-xs text-brand-mid">{l}</div><div className={"chip mt-1 text-base " + c}>{v}</div></div>
        ))}
      </div>
      {counter.over && <p className="alert-bad">⚠ عدد المسجلين تجاوز السعة القصوى للرحلة</p>}

      {w && (
        <section className="card space-y-2">
          <h2 className="font-bold">رقم الرحلة والتواريخ</h2>
          <SmallForm action={updateTripBasics.bind(null, trip.id)} submit="حفظ" fields={[
            { name: "tripNo", label: "رقم الرحلة", ltr: true, defaultValue: trip.tripNo ?? "" },
            { name: "departDate", label: "تاريخ الذهاب", ltr: true, date: true, placeholder: "DD/MM/YYYY", defaultValue: formatDate(trip.departDate) },
            { name: "returnDate", label: "تاريخ العودة", ltr: true, date: true, placeholder: "DD/MM/YYYY", defaultValue: formatDate(trip.returnDate) },
          ]} />
          <p className="text-xs text-brand-mid">الحقول الثلاثة اختيارية ويمكن تركها فارغة.</p>
        </section>
      )}

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
                  <Link className="font-bold text-brand underline" href={`/trips/${trip.id}/bus/${b.id}`}>{busLabel(b)}</Link>
                  {" "}— {b.seatCount} مقعد{b.driverName ? ` · ${b.driverName}` : ""} {b.driverPhone && <span className="ltr">{b.driverPhone}</span>}{b.company ? ` · ${b.company}` : ""}
                  {w && <span className="ms-3"><DeleteBusButton tripId={trip.id} busId={b.id} /></span>}
                </li>
              ))}
            </ul>
            {w && <SmallForm action={addBus.bind(null, trip.id)} submit="إضافة باص" fields={[{ name: "name", label: "اسم الباص (اختياري)" }, { name: "number", label: "رقم الباص (تلقائي)" }, { name: "seatCount", label: "عدد المقاعد", ltr: true, type: "number" }, { name: "driverName", label: "السائق" }, { name: "driverPhone", label: "هاتف السائق", ltr: true, type: "tel" }, { name: "company", label: "شركة النقل" }]} />}
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
                <SmallForm action={addCar.bind(null, trip.id)} submit="إضافة سيارة" fields={[{ name: "label", label: "السيارة", required: true }, { name: "driverName", label: "السائق" }, { name: "driverPhone", label: "هاتف", ltr: true, type: "tel" }, { name: "capacity", label: "الركاب", type: "number", ltr: true }]} />
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


      <form id="groupform" action={createCompanionGroup.bind(null, trip.id)} />
      <section className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <h2 className="font-bold">المعتمرون ({rows.length})</h2>
          {bw && <AddPilgrimDialog tripId={trip.id} hotels={hotelOpts} defaults={{ makkahHotelId: trip.makkahHotelId ?? "", madinahHotelId: trip.madinahHotelId ?? "" }} />}
          {bw && (
            <div className="flex items-center gap-2 text-sm">
              <select form="groupform" name="kind" className="input w-auto"><option value="COMPANIONS">عصبة</option><option value="FAMILY">عائلة (اختر رب الأسرة بالدائرة)</option></select>
              <button form="groupform" className="btn-secondary">اجعل المحددين مجموعة واحدة</button>
            </div>
          )}
        </div>
        <table className="w-full">
          <thead><tr><th className="th" />{["الاسم", "الجواز", "المجموعة", "التسكين", "المقعد / التذكرة", ...(money ? ["السعر", "المتبقي"] : []), "تنبيهات", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const b = r.booking, gid = groupOf(r);
              return (
                <tr key={b.id}>
                  <td className="td">{bw && <><input form="groupform" type="checkbox" name="bookingIds" value={b.id} aria-label="تحديد" /><label className="mt-1 flex items-center gap-1 text-[11px] text-brand-mid"><input form="groupform" type="radio" name="headBookingId" value={b.id} aria-label="رب الأسرة" />رب</label></>}</td>
                  <td className="td"><Link className="font-bold underline" href={`/pilgrims/${b.pilgrimId}`}>{fullNameAr(b.pilgrim)}</Link></td>
                  <td className="td ltr">{b.pilgrim.passportNo}</td>
                  <td className="td space-y-1">{gid ? (
                    <>
                      <span className="chip chip-gray">{groups.get(gid)!.kind === "COMPANIONS" ? "عصبة" : "عائلة"} ({groups.get(gid)!.members.length})</span>
                      {groups.get(gid)!.kind === "FAMILY" && (groups.get(gid)!.head === b.id
                        ? <div><span className="chip chip-ok">رب الأسرة</span>{money && <> <Link className="text-xs underline" href={`/families/${gid}`}>حساب الأسرة</Link></>}</div>
                        : bw && <form action={setFamilyHead.bind(null, trip.id, gid, b.id)}><button className="text-xs underline">اجعله رب الأسرة</button></form>)}
                    </>
                  ) : ""}</td>

                  <td className="td">
                    {(() => {
                      const roomOf = (c: "MAKKAH" | "MADINAH") => b.rooms.find((x) => x.city === c)?.room;
                      const mkR = roomOf("MAKKAH"), mdR = roomOf("MADINAH");
                      const nm = (h?: { localName: string | null; officialName: string } | null) => (h ? h.localName ?? h.officialName : "");
                      const summary = [mkR && `مكة: ${nm(mkR.hotel)} / ${mkR.roomNo}`, mdR && `المدينة: ${nm(mdR.hotel)} / ${mdR.roomNo}`, b.roomType && ROOM_TYPE_LABELS[b.roomType as keyof typeof ROOM_TYPE_LABELS]].filter(Boolean).join(" · ");
                      return accWrite ? (
                        <AccommodationEditor action={setAccommodation.bind(null, trip.id, b.id)} hotels={hotelOpts} summary={summary}
                          values={{ makkahHotelId: b.makkahHotelId ?? trip.makkahHotelId ?? "", madinahHotelId: b.madinahHotelId ?? trip.madinahHotelId ?? "", roomType: b.roomType ?? "", makkahRoomNo: mkR?.roomNo ?? "", madinahRoomNo: mdR?.roomNo ?? "" }} />
                      ) : <span className="text-sm">{summary}</span>;
                    })()}
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
