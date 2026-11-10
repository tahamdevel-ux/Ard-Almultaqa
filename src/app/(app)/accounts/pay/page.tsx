import Link from "next/link";
import { db } from "@/server/db";
import { requirePage } from "@/server/auth";
import { getSetting } from "@/server/settings";
import { fullNameAr } from "@/server/pilgrims";
import { formatDate } from "@/domain/dates";
import { tripLabel } from "@/lib/tripLabel";
import { AccountsPayForm } from "@/components/AccountsPayForm";

export default async function PayPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  await requirePage("payments.record");
  const { booking } = await searchParams;
  const [bookings, agents, rate] = await Promise.all([
    db.booking.findMany({
      where: { status: "ACTIVE", deletedAt: null, trip: { deletedAt: null, archivedAt: null } }, include: { pilgrim: true, trip: true },
      orderBy: [{ trip: { createdAt: "desc" } }, { tripId: "desc" }, { createdAt: "asc" }],
    }),
    db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSetting("usdRate"),
  ]);
  const today = formatDate(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="page-title">تسجيل دفعة</h1><Link href="/accounts" className="btn-secondary">رجوع للحسابات</Link></div>
      <section className="card">
        <AccountsPayForm bookings={bookings.map((b) => ({ id: b.id, label: `${fullNameAr(b.pilgrim)} (${b.pilgrim.passportNo})`, trip: tripLabel(b.trip), agentId: b.agentId }))}
          agents={agents} rate={rate} today={today} initialBooking={booking} />
        <p className="mt-2 text-xs text-brand-mid">يُحسب المبلغ بالدولار؛ عند الدفع بالدينار اكتب سعر الصرف وقت التسديد. الدفعة لا تتجاوز المتبقي على الحجز.</p>
      </section>
    </div>
  );
}
