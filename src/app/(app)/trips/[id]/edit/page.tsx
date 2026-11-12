import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { formatDate } from "@/domain/dates";
import { TRANSPORT_LABELS, TRIP_STATUS_LABELS } from "@/lib/labels";
import { TripEditForm } from "@/components/TripEditForm";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("trips.write");
  const { id } = await params;
  const trip = await db.trip.findFirst({ where: { id, deletedAt: null } });
  if (!trip) notFound();
  const supervisors = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "الرحلات", href: "/trips" }, { label: trip.tripNo ?? trip.name, href: `/trips/${id}` }, { label: "تعديل" }]} />
      <div className="flex items-center justify-between">
        <h1 className="page-title">تعديل الرحلة</h1>
        <Link href="/trips" className="btn-secondary">رجوع للرحلات</Link>
      </div>
      <p className="text-sm text-brand-mid">نوع النقل: {TRANSPORT_LABELS[trip.transportType]} (لا يتغيّر بعد إنشاء الرحلة)</p>
      <TripEditForm
        tripId={trip.id} supervisors={supervisors} statuses={Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        initial={{ tripNo: trip.tripNo ?? "", name: trip.name, departDate: formatDate(trip.departDate), returnDate: formatDate(trip.returnDate), capacity: String(trip.capacity),
          supervisorId: trip.supervisorId ?? "", status: trip.status, nightsMakkah: String(trip.nightsMakkah), nightsMadinah: String(trip.nightsMadinah) }}
      />
    </div>
  );
}
