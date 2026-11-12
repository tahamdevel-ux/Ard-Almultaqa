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
import { computePrice } from "@/domain/pricing";
import { seatsLabel, vacancyLabel } from "@/domain/labels";
import { TransportCell } from "@/components/TransportCell";
import { effectiveMode, transportText } from "@/domain/transport";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RowMenu } from "@/components/RowMenu";
import { Icon } from "@/components/icons";
import { Bar, EmptyState } from "@/components/charts";
import { TripTabs } from "@/components/TripTabs";
import { HotelPricesForm, TripExtrasForm, type HotelRow } from "@/components/TripPricingForms";
import { auditTripPrices, loadTripHotels } from "@/server/tripHotels";
import { RecalcPrices } from "@/components/RecalcPrices";
import { AccommodationEditor, type HotelOpt } from "@/components/AccommodationFields";
import { SmallForm } from "@/components/SmallForm";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";
import { db } from "@/server/db";
import { balance, formatMoney } from "@/domain/money";
import { ROOM_TYPE_LABELS } from "@/domain/rooming";
import { updateTripBasics, saveAsProgram, setTripHotels, addBus, addCar, addFlight, createCompanionGroup, setFamilyHead, dissolveGroup, removeBooking, setAccommodation, saveHotelPrices, saveTripExtras, saveHayaInfo, recalcPrices, saveTransport } from "../actions";
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
  const priceTables = Object.fromEntries(hotelRows.map((r) => [r.hotelId, { prices: r.prices, noHousing: r.noHousingPrice }]));
  const priceAudit = money ? await auditTripPrices(trip.id) : { total: 0, noPrice: 0, differs: 0, manual: 0 };
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

  const STATUS_CHIP = { OPEN: "chip-ok", FULL: "chip-warn", TRAVELLING: "chip-gray", RETURNED: "chip-gray", CANCELLED: "chip-bad" } as const;
  const seats = seatsLabel(counter.registered, counter.capacity);
  const owed = money ? Math.round(rows.reduce((n, r) => n + Math.max(0, balance(r.booking.priceAmount, r.booking.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))) ?? 0), 0)) : 0;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "الرحلات", href: "/trips" }, { label: trip.tripNo ?? trip.name }]} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-light text-brand"><Icon name={trip.transportType === "AIR" ? "plane" : "bus"} size={24} /></span>
          <div className="min-w-0">
            <h1 className="page-title">{trip.name}{archived && <span className="chip chip-gray ms-2 align-middle">مؤرشفة</span>}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              {trip.tripNo && <span className="chip chip-gray" dir="ltr">{trip.tripNo}</span>}
              <span className="chip chip-gray">{TRANSPORT_LABELS[trip.transportType]}</span>
              <span className={"chip " + STATUS_CHIP[trip.status]}>{TRIP_STATUS_LABELS[trip.status]}</span>
              <span className="text-brand-mid">{dateRangeLabel(trip.departDate, trip.returnDate)}</span>
              {trip.supervisor && <span className="text-brand-mid">· المشرف: {trip.supervisor.name}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bw && <AddPilgrimDialog tripId={trip.id} hotels={hotelOpts} tables={money ? priceTables : undefined} sarfAmount={trip.sarfAmount} priced={hotelRows.map((r) => ({ id: r.hotelId, name: r.name }))} air={trip.transportType === "AIR"} defaults={{ makkahHotelId: trip.makkahHotelId ?? "", madinahHotelId: trip.madinahHotelId ?? "" }} />}
          <RowMenu label="إجراءات الرحلة">
            {w && <Link className="menu-item" href={`/trips/${trip.id}/edit`}>تعديل الرحلة</Link>}
            {can(user.role, "outputs.view") && <Link className="menu-item" href={`/trips/${trip.id}/prints`}>المطبوعات</Link>}
            {can(user.role, "programs.write") && <form action={saveAsProgram.bind(null, trip.id)}><button className="menu-item">حفظ كقالب</button></form>}
            <TripArchiveButton tripId={trip.id} name={trip.name} archived={archived} canArchive={can(user.role, "trips.archive")} canUnarchive={can(user.role, "trips.unarchive")} menuItem />
          </RowMenu>
        </div>
      </header>

      <TripTabs tripId={trip.id} active="details" land={trip.transportType === "LAND"} rooming={can(user.role, "officeRooms.view")} prints={can(user.role, "outputs.view")} />

      {archived && <p className="alert-warn">هذه رحلة مؤرشفة: للعرض والطباعة فقط. لا يمكن التعديل عليها.</p>}

      <section className="card grid grid-cols-2 divide-x-reverse divide-line p-0 sm:grid-cols-4 sm:divide-x" aria-label="ملخص الرحلة">
        <div className="p-4">
          <div className="text-xs font-bold text-brand-mid">المسجّلون</div>
          <div className="mt-1 text-xl font-bold">{counter.registered}{counter.capacity > 0 && <span className="text-sm font-normal text-brand-mid"> من {counter.capacity}</span>}</div>
          {counter.capacity > 0 ? <div className="mt-2"><Bar value={counter.registered} max={counter.capacity} tone={counter.over ? "red" : "brand"} /></div> : <span className="chip chip-warn mt-2">{seats.text}</span>}
        </div>
        <div className="p-4"><div className="text-xs font-bold text-brand-mid">جاهزون للسفر</div><div className="mt-1 text-xl font-bold text-emerald-800">{counter.ready}<span className="text-sm font-normal text-brand-mid"> من {counter.registered}</span></div></div>
        <div className="p-4"><div className="text-xs font-bold text-brand-mid">الشواغر</div><div className="mt-1 text-xl font-bold">{vacancyLabel(counter.registered, counter.capacity)}</div></div>
        {money && <div className="p-4"><div className="text-xs font-bold text-brand-mid">المتبقي على المعتمرين</div><div className={"mt-1 text-xl font-bold " + (owed > 0 ? "text-red-700" : "text-emerald-800")}>{formatMoney(owed, "USD")}</div></div>}
      </section>
      {counter.over && counter.capacity > 0 && <p className="alert-bad">⚠ عدد المسجلين تجاوز السعة القصوى للرحلة بـ {counter.registered - counter.capacity}</p>}
      {counter.capacity <= 0 && <p className="alert-warn">لم تُحدَّد سعة لهذه الرحلة — حدّدها من «تعديل الرحلة» ليظهر عدد الشواغر.</p>}

      {money && <RecalcPrices action={recalcPrices.bind(null, trip.id)} audit={priceAudit} canEdit={pw} />}

      <form id="groupform" action={createCompanionGroup.bind(null, trip.id)} />
      <section className="card p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <h2 className="text-base font-bold">المعتمرون <span className="font-normal text-brand-mid">({shownRows.length}{shownRows.length !== rows.length ? ` من ${rows.length}` : ""})</span></h2>
          <div className="min-w-[14rem] flex-1"><TripSearch placeholder="بحث: اسم، أم، جواز، هاتف، وكيل، فندق، غرفة المكتب" /></div>
          {seeNotes && <Link className={"rounded-full border px-3.5 py-1.5 text-sm font-bold " + (sp.notes === "1" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark hover:bg-canvas")} href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.notes === "1" ? {} : { notes: "1" }) })}`}>لديهم ملاحظات</Link>}
          {bw && (
            <div className="flex items-center gap-2 rounded-xl bg-canvas px-2 py-1.5 text-sm" title="علّم المعتمرين في العمود الأول ثم اجمعهم">
              <span className="font-bold text-brand-mid">تجميع المحددين:</span>
              <select form="groupform" name="kind" aria-label="نوع المجموعة" className="input w-auto py-1"><option value="COMPANIONS">عصبة</option><option value="FAMILY">عائلة (الأول رب الأسرة)</option></select>
              <button form="groupform" className="btn-secondary btn-sm">اجمع</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto md:overflow-visible">
          <table className="rt w-full">
            <thead><tr>
              <th className="th w-10"><span className="sr-only">تحديد</span></th><th className="th">المعتمر</th><th className="th">المجموعة</th><th className="th">التسكين</th><th className="th">النقل</th>{money && <th className="th">السعر / المتبقي</th>}<th className="th w-24">تنبيهات</th><th className="th w-12"><span className="sr-only">إجراءات</span></th>
            </tr></thead>
            <tbody>
              {shownRows.map((r) => {
                const b = r.booking, gid = groupOf(r);
                const grp = gid ? groups.get(gid) : undefined;
                const roomOf = (c: "MAKKAH" | "MADINAH") => b.rooms.find((x) => x.city === c)?.room;
                const mkR = roomOf("MAKKAH"), mdR = roomOf("MADINAH");
                const nm = (h?: { localName: string | null; officialName: string } | null) => (h ? h.localName ?? h.officialName : "");
                const hotel = b.tripHotelId ? hotelName(tripHotels.find((h) => h.id === b.tripHotelId)?.hotel) : "";
                const typeLabel = b.noHousing ? "بدون سكن" : b.roomType ? ROOM_TYPE_LABELS[b.roomType as keyof typeof ROOM_TYPE_LABELS] : "";
                const accSummary = (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {hotel && <span className="font-bold">{hotel}</span>}
                      {typeLabel && <span className={"chip " + (b.noHousing ? "chip-warn" : "chip-gray")}>{typeLabel}</span>}
                      {!hotel && !typeLabel && <span className="text-brand-mid">لم يُحدَّد</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-brand-mid">
                      {[mkR && `مكة: ${nm(mkR.hotel)} / ${mkR.roomNo}`, mdR && `المدينة: ${nm(mdR.hotel)} / ${mdR.roomNo}`, !b.withFood && "بدون طعام", b.officeMember && `غرفة ${b.officeMember.officeRoom.code ?? ""}${b.officeMember.officeRoom.seq}`].filter(Boolean).join(" · ")}
                    </div>
                  </>
                );
                const bal = money ? balance(b.priceAmount, b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))) : null;
                return (
                  <tr key={b.id} data-href={`/pilgrims/${b.pilgrimId}`}>
                    <td className="td">{bw && <input form="groupform" type="checkbox" name="bookingIds" value={b.id} aria-label={`تحديد ${fullNameAr(b.pilgrim)}`} className="h-4 w-4" />}</td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link className="font-bold text-ink hover:text-brand" href={`/pilgrims/${b.pilgrimId}`}>{fullNameAr(b.pilgrim)}</Link>
                        {grp && grp.kind === "FAMILY" && grp.head === b.id && <HeadTag />}
                        {b.tripRole && <span className="chip chip-warn">{TRIP_ROLE_LABELS[b.tripRole]}</span>}
                        {seeNotes && (b.pilgrim.healthNotes ?? "").trim() && <span title={b.pilgrim.healthNotes ?? ""} aria-label={`ملاحظة: ${b.pilgrim.healthNotes}`} tabIndex={0} role="img" className="cursor-help text-base">📝</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-brand-mid"><span dir="ltr">{b.pilgrim.passportNo}</span>{b.agent && <span>· {b.agent.name}</span>}</div>
                    </td>
                    <td className="td text-sm">
                      {grp ? (
                        <div className="space-y-1">
                          <span className="chip chip-gray">{grp.kind === "COMPANIONS" ? "عصبة" : "عائلة"} ({grp.members.length})</span>
                          {grp.kind === "FAMILY" && grp.head !== b.id && grp.headName && <div className="text-xs text-brand-mid">تابع لـ {grp.headName}</div>}
                          {grp.kind === "FAMILY" && grp.head === b.id && <div className="flex flex-wrap items-center gap-1.5"><span className="chip chip-ok">رب الأسرة</span>{money && <Link className="text-xs font-bold text-brand underline" href={`/families/${gid}`}>حساب الأسرة</Link>}</div>}
                          {grp.kind === "FAMILY" && grp.head !== b.id && bw && <form action={setFamilyHead.bind(null, trip.id, gid!, b.id)}><button className="btn-ghost btn-sm">اجعله رب الأسرة</button></form>}
                        </div>
                      ) : <span className="text-brand-mid">—</span>}
                    </td>
                    <td className="td">
                      {accWrite ? (
                        <AccommodationEditor action={setAccommodation.bind(null, trip.id, b.id)} hotels={hotelOpts} tables={money ? priceTables : undefined} sarfAmount={trip.sarfAmount} priced={hotelRows.map((r) => ({ id: r.hotelId, name: r.name }))} air={trip.transportType === "AIR"} summary={accSummary}
                          values={{ makkahHotelId: b.tripHotelId ? tripHotels.find((h) => h.id === b.tripHotelId)?.hotelId ?? "" : b.makkahHotelId ?? "", madinahHotelId: "", roomType: b.roomType ?? "", makkahRoomNo: "", madinahRoomNo: "", housing: b.noHousing ? "NO" : "", food: b.withFood ? "1" : "0", sarf: b.sarfByPilgrim ? "PILGRIM" : "COMPANY", tripRole: b.tripRole ?? "", officeRoom: b.officeMember ? `${b.officeMember.officeRoom.code ?? ""}${b.officeMember.officeRoom.seq}` : "" }} />
                      ) : <div className="text-sm">{accSummary}</div>}
                    </td>
                    <td className="td">
                      <TransportCell action={saveTransport.bind(null, trip.id, b.id)} canEdit={sw} mode={effectiveMode(b.transport, trip.transportType)} carId={b.seat?.carId ?? ""} flightId={b.seat?.flightId ?? ""}
                        opts={{ cars: trip.cars.map((c) => ({ id: c.id, label: c.label })), flights: trip.flights.map((f) => ({ id: f.id, label: `رحلة ${f.flightNo}` })), seatText: b.seat?.bus ? transportText("BUS", b.seat) : null, busHref: b.seat?.bus ? `/trips/${trip.id}/bus/${b.seat.bus.id}` : null }} />
                    </td>
                    {money && (
                      <td className="td">
                        {b.priceAmount == null ? <span className="chip chip-warn">بلا سعر</span> : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold">{formatMoney(b.priceAmount, b.priceCurrency)}</span>
                            {(() => {
                              if (b.priceManual) return <span className="chip chip-gray" title="سعر مكتوب يدوياً">يدوي</span>;
                              const th = tripHotels.find((h) => h.id === b.tripHotelId);
                              if (!th) return null;
                              const rr = computePrice({ table: { prices: Object.fromEntries(th.prices.map((p) => [p.roomType, p.amount])), noHousingPrice: th.noHousingPrice }, roomType: (b.roomType as never) ?? null, noHousing: b.noHousing, sarfByPilgrim: b.sarfByPilgrim, sarfAmount: trip.sarfAmount });
                              return rr.ok && rr.amount !== b.priceAmount ? <span className="chip chip-warn" title={`جدول الفندق يعطي ${formatMoney(rr.amount, "USD")}`}>≠ الجدول</span> : null;
                            })()}
                          </div>
                        )}
                        <div className="mt-0.5 text-xs"><Link className={"underline " + ((bal ?? 0) > 0 ? "font-bold text-red-700" : "text-brand-mid")} href={`/bookings/${b.id}`}>{bal == null ? "فتح الحساب" : (bal ?? 0) > 0 ? `متبقٍ ${formatMoney(bal, b.priceCurrency)}` : "مسدّد"}</Link></div>
                      </td>
                    )}
                    <td className="td">
                      {r.warnings.length > 0 && (
                        <span className="chip chip-warn cursor-help" tabIndex={0} title={r.warnings.join("\n")} aria-label={r.warnings.join("، ")}>⚠ {r.warnings.length}</span>
                      )}
                    </td>
                    <td className="td text-end">
                      <RowMenu label={`إجراءات ${fullNameAr(b.pilgrim)}`}>
                        <Link className="menu-item" href={`/pilgrims/${b.pilgrimId}`}>ملف المعتمر</Link>
                        {money && <Link className="menu-item" href={`/bookings/${b.id}`}>حساب الحجز</Link>}
                        {gid && bw && <ConfirmForm action={dissolveGroup.bind(null, trip.id, gid)} message="فك هذه المجموعة؟ يبقى المعتمرون في الرحلة لكنهم لن يكونوا أسرة/عصبة."><button className="menu-item">فك المجموعة</button></ConfirmForm>}
                        {bw && <ConfirmForm action={removeBooking.bind(null, trip.id, b.id)} message={`إزالة ${fullNameAr(b.pilgrim)} من هذه الرحلة؟ يُلغى حجزه وتُحرَّر غرفته ومقعده.`}><button className="menu-item menu-item-danger">إزالة من الرحلة</button></ConfirmForm>}
                      </RowMenu>
                    </td>
                  </tr>
                );
              })}
              {shownRows.length === 0 && <tr><td colSpan={8}><EmptyState icon={<Icon name="inbox" size={36} />} text={rows.length === 0 ? "لا يوجد معتمرون في هذه الرحلة بعد — اضغط «إضافة معتمر»" : "لا توجد نتائج بهذا البحث"} /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section id="buses" className="card space-y-3">
        <h2 className="font-bold">وسائل النقل (باص، سيارة، رحلة جوية)</h2>
        <>
          <h3 className="text-sm font-bold text-brand-mid">الباصات</h3>
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
          <h3 className="mt-2 text-sm font-bold text-brand-mid">الرحلات الجوية والسيارات</h3>
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
