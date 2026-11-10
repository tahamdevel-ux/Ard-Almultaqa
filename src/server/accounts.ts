import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { accountTotals, agentCommission, periodStart, type Period } from "@/domain/accounts";
import { paidTotal } from "@/domain/money";
import { TRIP_ORDER } from "./trips";
import { fullNameAr } from "./pilgrims";

export interface AccountsFilter { period: Period; trip?: string; agent?: string; onlyDue?: boolean; hideArchived?: boolean }

/** Every booking (active or cancelled) of trips created in the period, with what was paid on it. */
async function loadBookings(f: AccountsFilter) {
  const from = periodStart(f.period);
  const where: Prisma.BookingWhereInput = {
    deletedAt: null, status: { in: ["ACTIVE", "CANCELLED"] },
    trip: { deletedAt: null, ...(f.hideArchived ? { archivedAt: null } : {}), ...(from ? { createdAt: { gte: from } } : {}) }, // archived trips count unless hidden
  };
  const rows = await db.booking.findMany({
    where, include: { pilgrim: true, trip: true, agent: true, payments: true },
    orderBy: [{ trip: { createdAt: "desc" } }, { tripId: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((b) => ({
    b, status: b.status as "ACTIVE" | "CANCELLED",
    price: b.priceAmount, paid: paidTotal(b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))),
  }));
}

export async function accountsOverview(f: AccountsFilter) {
  const rows = await loadBookings(f);
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });

  // trips tab: one row per trip, newest created first
  const byTrip = new Map<string, typeof rows>();
  for (const r of rows) byTrip.set(r.b.tripId, [...(byTrip.get(r.b.tripId) ?? []), r]);
  const tripRows = [...byTrip.values()].map((list) => ({ trip: list[0].b.trip, pilgrims: list.filter((x) => x.status === "ACTIVE").length, ...accountTotals(list) }));
  tripRows.sort((a, b) => b.trip.createdAt.getTime() - a.trip.createdAt.getTime() || (a.trip.id < b.trip.id ? 1 : -1));

  // pilgrims tab: one row per booking, optionally filtered by trip / agent / only those who still owe
  let pilgrimRows = rows.map((r) => {
    const t = accountTotals([r]);
    return { bookingId: r.b.id, name: fullNameAr(r.b.pilgrim), trip: r.b.trip, agent: r.b.agent, status: r.status, ...t };
  });
  if (f.trip) pilgrimRows = pilgrimRows.filter((r) => r.trip.id === f.trip);
  if (f.agent) pilgrimRows = pilgrimRows.filter((r) => r.agent?.id === f.agent);
  if (f.onlyDue) pilgrimRows = pilgrimRows.filter((r) => r.remaining > 0.005);

  // agents tab: one row per agent
  const agentPayments = await db.payment.findMany({
    where: { booking: { deletedAt: null, trip: { deletedAt: null, ...(f.hideArchived ? { archivedAt: null } : {}), ...(periodStart(f.period) ? { createdAt: { gte: periodStart(f.period)! } } : {}) } } },
    select: { kind: true, credited: true, source: true, sourceAgentId: true, booking: { select: { agentId: true } } },
  });
  const agentRows = agents.map((a) => {
    const mine = rows.filter((r) => r.b.agentId === a.id);
    const t = accountTotals(mine);
    const sum = (pred: (p: (typeof agentPayments)[number]) => boolean) => agentPayments.filter(pred).reduce((n, p) => n + (p.kind === "PAYMENT" ? 1 : -1) * Number(p.credited), 0);
    return {
      agent: a, pilgrims: mine.filter((r) => r.status === "ACTIVE").length, due: t.due, remaining: t.remaining,
      viaAgent: Math.round(sum((p) => p.source === "AGENT" && p.sourceAgentId === a.id) * 100) / 100,
      direct: Math.round(sum((p) => p.source === "DIRECT" && p.booking.agentId === a.id) * 100) / 100,
      commission: agentCommission(mine, { type: a.commissionType, value: Number(a.commissionValue) }),
    };
  }).filter((a) => a.pilgrims > 0 || a.viaAgent || a.direct);

  const totals = accountTotals(rows);
  return { totals: { ...totals, commission: Math.round(agentRows.reduce((n, a) => n + a.commission, 0) * 100) / 100 }, tripRows, pilgrimRows, agentRows, agents };
}

export async function paymentsLog(period: Period, q?: string) {
  const from = periodStart(period);
  const term = (q ?? "").trim();
  const rows = await db.payment.findMany({
    where: {
      booking: { deletedAt: null },
      ...(from ? { paidAt: { gte: from } } : {}),
      ...(term ? { OR: [
        ...(/^\d+$/.test(term) ? [{ receiptNo: Number(term) }] : []),
        { booking: { pilgrim: { OR: term.split(/\s+/).map((w) => ({ OR: [{ firstName: { contains: w } }, { fatherName: { contains: w } }, { grandfatherName: { contains: w } }, { familyName: { contains: w } }, { enGivenName: { contains: w, mode: "insensitive" as const } }, { enSurname: { contains: w, mode: "insensitive" as const } }] })) } } },
      ] } : {}),
    },
    include: { booking: { include: { pilgrim: true, trip: true } } },
    orderBy: [{ paidAt: "desc" }, { receiptNo: "desc" }], take: 500,
  });
  const agentIds = [...new Set(rows.map((r) => r.sourceAgentId).filter((x): x is string => !!x))];
  const agents = await db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } });
  const an = new Map(agents.map((a) => [a.id, a.name]));
  return rows.map((p) => ({ ...p, pilgrimName: fullNameAr(p.booking.pilgrim), agentName: p.sourceAgentId ? an.get(p.sourceAgentId) ?? "" : "" }));
}

export { TRIP_ORDER };
