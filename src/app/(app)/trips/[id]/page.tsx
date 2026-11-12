import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip, loadTripDetail } from "@/server/trips";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { normalizeSearch, searchTokens } from "@/domain/searchNorm";
import { TripSearch } from "@/components/TripSearch";
import { TripArchiveButton } from "@/components/TripArchiveButton";
import { formatDate } from "@/domain/dates";
import { HeadTag } from "@/components/HeadTag";
import { TRIP_ROLE_LABELS } from "@/domain/tripRoles";
import { busLabel, dateRangeLabel, tripLabel } from "@/lib/tripLabel";
import { DeleteBusButton } from "@/components/BusTools";
import { AddPilgrimDialog } from "@/components/AddPilgrimDialog";
import { seatsLabel, vacancyLabel } from "@/domain/labels";
import { ConfirmForm } from "@/components/ConfirmForm";
import { TripTabs } from "@/components/TripTabs";
import { HotelPricesForm, TripExtrasForm, type HotelRow } from "@/components/TripPricingForms";
import { loadTripHotels } from "@/server/tripHotels";
import { AccommodationEditor, type HotelOpt } from "@/components/AccommodationFields";
import { SmallForm } from "@/components/SmallForm";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";
import { db } from "@/server/db";
import { balance, formatMoney } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { updateTripBasics, saveAsProgram, setTripHotels, addBus, addCar, addFlight, createCompanionGroup, setFamilyHead, dissolveGroup, removeBooking, setAirAssignment, setAccommodation, saveHotelPrices, saveTripExtras, saveHayaInfo } from "../actions";
import { DateInput } from "@/components/DateInput";

export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; notes?: string }> }) {
  const user = await requirePage("trips.view");
  const { id } = await params;
  const sp = await searchParams;
  const d = await loadTripDetail(id);
  if (!d) notFound();
  const { trip, rows, counter } = d;
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const archived = !!trip.archivedAt; // an archived trip is read-only (prints and exports still work)
  const w = can(user.role, "trips.write") && !archived, bw = can(user.role, "bookings.write") && !archived, sw = can(user.role, "seats.write") && !archived;
  const groups = new Map<string, { kind: string; members: string[]; head?: string; headName?: string }>();
  for (const r of rows) for (const g of r.booking.groups) {
    const e = groups.get(g.groupId) ?? { kind: g.group.kind, members: [] };
    if (g.isHead) { e.head = r.booking.id; e.headName = fullNameAr(r.booking.pilgrim); }
    e.members.push(r.booking.pilgrim.firstName + " " + r.booking.pilgrim.familyName);
    groups.set(g.groupId, e);
  }
  const hotels = w || bw || can(user.role, "rooming.write") ? await db.hotel.findMany({ where: { deletedAt: null }, orderBy: { officialName: "asc" } }) : [];
  const hotelOpts: HotelOpt[] = hotels.map((h) => ({ id: h.id, name: h.localName ?? h.officialName, city: h.city }));
  const accWrite = bw || (can(user.role, "rooming.write") && !archived);
  const hotelName = (h?: { localName: string | null; officialName: string } | null) => (h ? h.localName ?? h.officialName : "—");
  const mk = trip.makkahHotelId ? await db.hotel.findUnique({ where: { id: trip.makkahHotelId } }) : null;
  const md = trip.madinahHotelId ? await db.hotel.findUnique({ where: { id: trip.madinahHotelId } }) : null;
  const money = can(user.role, "payments.view"), pw = can(user.role, "prices.write") && !archived;
  const seeNotes = can(user.role, "pilgrims.health");
  const tripHotels = await loadTripHotels(trip.id);
  const hotelRows: HotelRow[] = await Promise.all(tripHotels.map(async (h) => ({ hotelId: h.hotelId, name: hotelName(h.hotel), used: await db.booking.count({ where: { tripHotelId: h.id, deletedAt: null } }), prices: Object.fromEntries(h.prices.map((p) => [p.roomType, p.amount])), noHousingPrice: h.noHousingPrice })));
  const allAgents = money && pw ? await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const agentOverrides = new Map((await db.tripAgentCommission.findMany({ where: { tripId: trip.id } })).map((c) => [c.agentId, c.amount]));
  const groupOf = (r: (typeof rows)[number]) => r.booking.groups[0]?.groupId;
  // search inside the trip: Arabic / English name, mother, passport, phone, agent, hotel, office room; Arabic digits and case ignored
  const allHotels = await db.hotel.findMany({ select: { id: true, officialName: true, localName: true } });
  const hotelById = new Map(allHotels.map((h) => [h.id, `${h.localName ?? ""} ${h.officialName}`]));
  const tokens = searchTokens(sp.q ?? "");
  const shownRows = rows.filter((r) => {
    const p = r.booking.pilgrim;
    if (sp.notes === "1" && !(p.healthNotes ?? "").trim()) return false;
    if (!tokens.length) return true;
    const room = r.booking.officeMember?.officeRoom;
    const hay = normalizeSearch([fullNameAr(p), fullNameEn(p), p.motherName ?? "", p.passportNo, p.phone ?? "", r.booking.agent?.name ?? "", hotelById.get(r.booking.makkahHotelId ?? "") ?? "", hotelById.get(r.booking.madinahHotelId ?? "") ?? "", mk ? hotelName(mk) : "", room ? `${room.code ?? ""}${room.seq}` : ""].join(" "));
    return tokens.every((t) => hay.includes(t));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="page-title">{tripLabel(trip)}{archived && <span className="chip chip-gray ms-2 align-middle">مؤرشفة</span>}</h1>
          <p className="text-sm text-brand-mid">{TRANSPORT_LABELS[trip.transportType]} · {dateRangeLabel(trip.departDate, trip.returnDate)} · {TRIP_STATUS_LABELS[trip.status]}{trip.supervisor && ` · المشرف: ${trip.supervisor.name}`}</p>
        </div>
      </div>
      <TripTabs tripId={trip.id} active="details" land={trip.transportType === "LAND"} rooming={can(user.role, "officeRooms.view")} prints={can(user.role, "outputs.view")} />

      {archived && <p className="alert-warn">هذه رحلة مؤرشفة: للعرض والطباعة فقط. لا يمكن التعديل عليها.</p>}
      <div className="flex flex-wrap gap-2"><TripArchiveButton tripId={trip.id} name={trip.name} archived={archived} canArchive={can(user.role, "trips.archive")} canUnarchive={can(user.role, "trips.unarchive")} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[["المسجّلون", seatsLabel(counter.registered, counter.capacity).text, "chip-" + ({ ok: "ok", bad: "bad", warn: "warn" } as const)[seatsLabel(counter.registered, counter.capacity).tone]], ["الجاهزون", String(counter.ready), "chip-ok"], ["الشواغر", vacancyLabel(counter.registered, counter.capacity), "chip-gray"]].map(([l, v, c]) => (
          <div key={l} className="card text-center"><div className="text-xs text-brand-mid">{l}</div><div className={"chip mt-1 text-base " + c}>{v}</div></div>
        ))}
      </div>
      {counter.over && counter.capacity > 0 && <p className="alert-bad">⚠ عدد المسجلين تجاوز السعة القصوى للرحلة بـ {counter.registered - counter.capacity}</p>}
      {counter.capacity <= 0 && <p className="alert-warn">لم تُحدَّد سعة لهذه الرحلة — حدّدها من «تعديل الرحلة» ليظهر عدد الشواغر.</p>}

      <form id="groupform" action={createCompanionGroup.bind(null, trip.id)} />
      <section className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex flex-1 flex-wrap items-center gap-3">
          <h2 className="font-bold">المعتمرون ({shownRows.length}{shownRows.length !== rows.length ? ` من ${rows.length}` : ""})</h2>
          <TripSearch placeholder="بحث: اسم، أم، جواز، هاتف، وكيل، فندق، غرفة المكتب" />
          {seeNotes && <a className={"rounded-lg border px-3 py-1.5 text-sm font-bold " + (sp.notes === "1" ? "bg-brand text-white" : "bg-white border-line text-brand-dark")} href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.notes === "1" ? {} : { notes: "1" }) })}`}>لديهم ملاحظات</a>}
          </div>
          {bw && <AddPilgrimDialog tripId={trip.id} hotels={hotelOpts} priced={hotelRows.map((r) => ({ id: r.hotelId, name: r.name }))} air={trip.transportType === "AIR"} defaults={{ makkahHotelId: trip.makkahHotelId ?? "", madinahHotelId: trip.madinahHotelId ?? "" }} />}
          {bw && (
            <div className="flex items-center gap-2 text-sm">
              <select form="groupform" name="kind" className="input w-auto"><option value="COMPANIONS">عصبة</option><option value="FAMILY">عائلة (اختر رب الأسرة بالدائرة)</option></select>
              <button form="groupform" className="btn-secondary">اجعل المحددين مجموعة واحدة</button>
            </div>
          )}
        </div>
        <table className="w-full">
          <thead><tr><th className="th" />{["الاسم", "الجواز", "الوكيل", ...(seeNotes ? ["ملاحظات"] : []), "المجموعة", "التسكين", "المقعد / التذكرة", ...(money ? ["السعر", "المتبقي"] : []), "تنبيهات", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {shownRows.map((r) => {
              const b = r.booking, gid = groupOf(r);
              return (
                <tr key={b.id}>
                  <td className="td">{bw && <><input form="groupform" type="checkbox" name="bookingIds" value={b.id} aria-label="تحديد" /><label className="mt-1 flex items-center gap-1 text-[11px] text-brand-mid"><input form="groupform" type="radio" name="headBookingId" value={b.id} aria-label="رب الأسرة" />رب</label></>}</td>
                  <td className="td"><Link className="font-bold underline" href={`/pilgrims/${b.pilgrimId}`}>{fullNameAr(b.pilgrim)}</Link>{gid && groups.get(gid)?.head === b.id && groups.get(gid)?.kind === "FAMILY" && <HeadTag />}{b.tripRole && <span className="chip chip-warn ms-2">{TRIP_ROLE_LABELS[b.tripRole]}</span>}</td>
                  <td className="td ltr">{b.pilgrim.passportNo}</td>
                  <td className="td">{b.agent?.name ?? "—"}</td>
                  {seeNotes && <td className="td">{(b.pilgrim.healthNotes ?? "").trim() ? <span title={b.pilgrim.healthNotes ?? ""} aria-label={`ملاحظة: ${b.pilgrim.healthNotes}`} tabIndex={0} role="img" className="cursor-help text-base">📝</span> : ""}</td>}
                  <td className="td space-y-1">{gid ? (
                    <>
                      <span className="chip chip-gray">{groups.get(gid)!.kind === "COMPANIONS" ? "عصبة" : "عائلة"} ({groups.get(gid)!.members.length})</span>
                      {groups.get(gid)!.kind === "FAMILY" && groups.get(gid)!.head !== b.id && groups.get(gid)!.headName && <div className="text-xs text-brand-mid">تابع لـ {groups.get(gid)!.headName}</div>}
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
                      const summary = [mkR && `مكة: ${nm(mkR.hotel)} / ${mkR.roomNo}`, mdR && `المدينة: ${nm(mdR.hotel)} / ${mdR.roomNo}`, b.noHousing ? "بدون سكن" : b.roomType && ROOM_TYPE_LABELS[b.roomType as keyof typeof ROOM_TYPE_LABELS], b.tripHotelId && `فندق مكة: ${hotelName(tripHotels.find((h) => h.id === b.tripHotelId)?.hotel)}`, !b.withFood && "بدون طعام", b.officeMember && `غرفة ${b.officeMember.officeRoom.code ?? ""}${b.officeMember.officeRoom.seq}`].filter(Boolean).join(" · ");
                      return accWrite ? (
                        <AccommodationEditor action={setAccommodation.bind(null, trip.id, b.id)} hotels={hotelOpts} priced={hotelRows.map((r) => ({ id: r.hotelId, name: r.name }))} air={trip.transportType === "AIR"} summary={summary}
                          values={{ makkahHotelId: b.tripHotelId ? tripHotels.find((h) => h.id === b.tripHotelId)?.hotelId ?? "" : b.makkahHotelId ?? "", madinahHotelId: "", roomType: b.roomType ?? "", makkahRoomNo: "", madinahRoomNo: "", housing: b.noHousing ? "NO" : "", food: b.withFood ? "1" : "0", sarf: b.sarfByPilgrim ? "PILGRIM" : "COMPANY", tripRole: b.tripRole ?? "", officeRoom: b.officeMember ? `${b.officeMember.officeRoom.code ?? ""}${b.officeMember.officeRoom.seq}` : "" }} />
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
                    {gid && bw && <ConfirmForm action={dissolveGroup.bind(null, trip.id, gid)} message="فك هذه المجموعة؟ يبقى المعتمرون في الرحلة لكنهم لن يكونوا أسرة/عصبة."><button className="text-xs underline">فك المجموعة</button></ConfirmForm>}
                    {bw && <ConfirmForm action={removeBooking.bind(null, trip.id, b.id)} message={`إزالة ${fullNameAr(b.pilgrim)} من هذه الرحلة؟ يُلغى حجزه وتُحرَّر غرفته ومقعده.`}><button className="text-xs font-bold text-red-700 underline">إزالة</button></ConfirmForm>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section id="buses" className="card space-y-3">
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

      {(w || money) && (
      <details className="card space-y-3" open={counter.registered === 0}>
        <summary className="cursor-pointer text-lg font-bold">إعدادات الرحلة <span className="text-sm font-normal text-brand-mid">(الرقم والتواريخ، الفنادق، الأسعار، العمولة، بيانات الهيئة)</span></summary>
        <div className="space-y-4 pt-3">
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
        <p className="text-sm">مكة: <b>{tripHotels.map((h) => hotelName(h.hotel)).join("، ") || hotelName(mk)}</b> ({trip.nightsMakkah} ليالي) · المدينة (ثابت): <b>{hotelName(md)}</b> ({trip.nightsMadinah} ليالي) · البداية من: {trip.firstCity === "MAKKAH" ? "مكة" : "المدينة"}</p>
        {w && (
          <form action={setTripHotels.bind(null, trip.id)} className="flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="madinahHotelId">فندق المدينة (ثابت)</label>
              <select id="madinahHotelId" name="madinahHotelId" defaultValue={trip.madinahHotelId ?? ""} className="input w-56"><option value="">— اختر —</option>{hotels.filter((h) => h.city === "MADINAH").map((h) => <option key={h.id} value={h.id}>{hotelName(h)}</option>)}</select></div>
            <div><label className="label" htmlFor="firstCity">المدينة الأولى</label>
              <select id="firstCity" name="firstCity" defaultValue={trip.firstCity} className="input w-40"><option value="MADINAH">نبدأ بالمدينة</option><option value="MAKKAH">نبدأ بمكة</option></select></div>
            <div><label className="label" htmlFor="nightsMadinah">ليالي المدينة</label>
              <input id="nightsMadinah" name="nightsMadinah" type="number" min={0} defaultValue={trip.nightsMadinah} className="input w-24" dir="ltr" /></div>
            <div><label className="label" htmlFor="nightsMakkah">ليالي مكة</label>
              <input id="nightsMakkah" name="nightsMakkah" type="number" min={0} defaultValue={trip.nightsMakkah} className="input w-24" dir="ltr" /></div>
            <button className="btn">حفظ</button>
          </form>
        )}
        {can(user.role, "programs.write") && <form action={saveAsProgram.bind(null, trip.id)}><button className="text-sm underline">حفظ هذه الرحلة كقالب</button></form>}
      </section>

      {w && trip.transportType === "LAND" && (
        <section className="card space-y-2">
          <h2 className="font-bold">بيانات منفيست الهيئة</h2>
          <SmallForm action={saveHayaInfo.bind(null, trip.id)} submit="حفظ" fields={[
            { name: "transportCompany", label: "شركة النقل", defaultValue: trip.transportCompany ?? "" },
            { name: "departGovernorate", label: "محافظة الانطلاق", defaultValue: trip.departGovernorate ?? "" },
            { name: "routeText", label: "طريق الانطلاق", defaultValue: trip.routeText ?? "" },
            { name: "sequenceNo", label: "التسلسل", ltr: true, defaultValue: trip.sequenceNo ?? "" },
          ]} />
          <p className="text-xs text-brand-mid">تظهر في أعلى منفيست الهيئة. المنفذ (عرعر) والموسم ثابتان في النموذج.</p>
        </section>
      )}
      {money && (
        <section className="card space-y-2">
          <h2 className="font-bold">فنادق مكة والأسعار (بالدولار)</h2>
          {pw ? <HotelPricesForm action={saveHotelPrices.bind(null, trip.id)} rows={hotelRows} candidates={hotels.filter((h) => h.city === "MAKKAH").map((h) => ({ id: h.id, name: hotelName(h) }))} />
            : <ul className="text-sm">{hotelRows.map((r) => <li key={r.hotelId}><b>{r.name}</b>: {Object.entries(r.prices).map(([k, v]) => `${ROOM_TYPE_LABELS[k as keyof typeof ROOM_TYPE_LABELS]} ${v}`).join(" · ")}{r.noHousingPrice != null ? ` · بدون سكن ${r.noHousingPrice}` : ""}</li>)}{hotelRows.length === 0 && <li>غير محددة</li>}</ul>}
        </section>
      )}
      {money && pw && (
        <section className="card space-y-2">
          <h2 className="font-bold">الطعام والتصريف وعمولة الوكيل</h2>
          <TripExtrasForm action={saveTripExtras.bind(null, trip.id)} air={trip.transportType === "AIR"} values={{ foodDefault: trip.foodDefault, sarfAmount: trip.sarfAmount, agentCommission: trip.agentCommission }}
            agents={allAgents.map((a) => ({ id: a.id, name: a.name, amount: agentOverrides.get(a.id) ?? null }))} />
        </section>
      )}

        </div>
      </details>
      )}
    </div>
  );
}
