import { Breadcrumbs } from "@/components/Breadcrumbs";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { can } from "@/lib/permissions";
import { canSeeTrip } from "@/server/trips";
import { tripLabel } from "@/lib/tripLabel";
import { DownloadLink } from "@/components/DownloadLink";
import { TripTabs } from "@/components/TripTabs";

const Btn = ({ href, children }: { href: string; children: React.ReactNode }) => <DownloadLink href={href}>{children}</DownloadLink>;
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card space-y-2"><h2 className="section-title">{title}</h2><div className="flex flex-wrap gap-2">{children}</div></section>
);

export default async function PrintsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("outputs.view");
  const { id } = await params;
  const trip = await db.trip.findFirst({ where: { id, deletedAt: null }, include: { buses: { orderBy: { number: "asc" } }, madinahHotel: true } });
  if (!trip) notFound();
  if (!canSeeTrip(user, trip)) redirect("/forbidden");
  const land = trip.transportType === "LAND";
  const rooming = can(user.role, "officeRooms.view");
  const tripHotels = await db.tripHotel.findMany({ where: { tripId: id }, include: { hotel: true } });
  const out = (kind: string, q: string) => `/api/trips/${id}/outputs/${kind}?${q}`;
  const hn = (h: { localName: string | null; officialName: string }) => h.localName ?? h.officialName;
  const busName = (b: { number: string; name: string | null }) => `باص ${b.number}${b.name ? ` (${b.name})` : ""}`;
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "الرحلات", href: "/trips" }, { label: tripLabel(trip), href: `/trips/${id}` }, { label: "المطبوعات" }]} />
      <h1 className="page-title">المطبوعات — {tripLabel(trip)}</h1>
      <TripTabs tripId={id} active="prints" land={land} rooming={rooming} prints />
      {land && (
        <Group title="بر">
          {trip.buses.map((b) => <span key={b.id} className="flex gap-1"><Btn href={out("manifest", `bus=${b.id}&format=pdf`)}>كشف {busName(b)} PDF</Btn><Btn href={out("manifest", `bus=${b.id}&format=xlsx`)}>Excel</Btn></span>)}
          <Btn href={out("seat-map", "format=pdf")}>خريطة المقاعد (كل الباصات) PDF</Btn>
          {trip.buses.length === 0 && <span className="text-sm text-brand-mid">لا توجد باصات بعد</span>}
        </Group>
      )}
      {!land && (
        <Group title="جو">
          <Btn href={out("flight-list", "format=pdf")}>قائمة الطيران PDF</Btn><Btn href={out("flight-list", "format=xlsx")}>قائمة الطيران Excel</Btn>
          <Btn href={out("tickets", "format=pdf")}>قائمة التذاكر PDF</Btn><Btn href={out("tickets", "format=xlsx")}>قائمة التذاكر Excel</Btn>
        </Group>
      )}
      {land && (
        <Group title="الهيئة">
          {trip.buses.map((b) => <Btn key={b.id} href={out("haya", `bus=${b.id}`)}>منفيست الهيئة — {busName(b)}</Btn>)}
          {trip.buses.length === 0 && <span className="text-sm text-brand-mid">لا توجد باصات بعد</span>}
        </Group>
      )}
      <Group title="التسكين">
        {rooming && <><DownloadLink className="btn" href={`/api/trips/${id}/office-rooms/print`}>طباعة التسكين الداخلي</DownloadLink><Btn href={`/api/trips/${id}/office-rooms/print?format=xlsx`}>تنزيل التسكين إكسل</Btn></>}
        {tripHotels.map((h) => (
          <span key={h.id} className="flex flex-wrap gap-1"><span className="self-center text-sm font-bold">مكة — {hn(h.hotel)}:</span>
            <Btn href={out("rooming-en", `city=MAKKAH&hotel=${h.id}&format=pdf`)}>English PDF</Btn><Btn href={out("rooming-en", `city=MAKKAH&hotel=${h.id}&format=xlsx`)}>English Excel</Btn>
            <Btn href={out("rooming-ar", `city=MAKKAH&hotel=${h.id}&format=pdf`)}>عربي PDF</Btn><Btn href={out("rooming-ar", `city=MAKKAH&hotel=${h.id}&format=xlsx`)}>عربي Excel</Btn></span>
        ))}
        <span className="flex flex-wrap gap-1"><span className="self-center text-sm font-bold">المدينة{trip.madinahHotel ? ` — ${hn(trip.madinahHotel)}` : ""}:</span>
          <Btn href={out("rooming-en", "city=MADINAH&format=pdf")}>English PDF</Btn><Btn href={out("rooming-en", "city=MADINAH&format=xlsx")}>English Excel</Btn>
          <Btn href={out("rooming-ar", "city=MADINAH&format=pdf")}>عربي PDF</Btn><Btn href={out("rooming-ar", "city=MADINAH&format=xlsx")}>عربي Excel</Btn></span>
      </Group>
      <p className="text-xs text-brand-mid">قوائم الفنادق تعرض رقم غرفة الفندق المُدخل على غرفة المكتب، ولا تحتوي أرقام المكتب الداخلية.</p>
    </div>
  );
}
