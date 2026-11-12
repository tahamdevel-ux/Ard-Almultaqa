import Link from "next/link";

/** Trip tabs: details, buses and seats, internal rooming, prints. */
export function TripTabs({ tripId, active, land, rooming, prints }: { tripId: string; active: "details" | "prints"; land: boolean; rooming: boolean; prints: boolean }) {
  const tab = (href: string, label: string, on = false) => <Link key={label} href={href} className={"rounded-t-lg border border-b-0 px-3 py-1.5 text-sm font-bold " + (on ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark")}>{label}</Link>;
  return (
    <nav aria-label="تبويبات الرحلة" className="flex flex-nowrap gap-1 overflow-x-auto border-b border-line">
      {tab(`/trips/${tripId}`, "تفاصيل الرحلة", active === "details")}
      {land && tab(`/trips/${tripId}#buses`, "الباصات والمقاعد")}
      {rooming && tab(`/trips/${tripId}/office-rooms`, "التسكين")}
      {prints && tab(`/trips/${tripId}/prints`, "المطبوعات", active === "prints")}
    </nav>
  );
}
