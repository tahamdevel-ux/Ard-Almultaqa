import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { accountTotals, agentCommission, periodStart, type Period } from "@/domain/accounts";
import { paidTotal } from "@/domain/money";
import { TRIP_ORDER } from "./trips";
import { fullNameAr } from "./pilgrims";
import { resolveCommission } from "@/domain/pricing";
import { commissionOverrides } from "./tripHotels";

export interface AccountsFilter { period: Period; trip?: string; agent?: string; onlyDue?: boolean; hideArchived?: boolean }

/**
 * Every booking (active or cancelled) of trips created in the period, with what was paid on it.
 * A DELETED trip still counts when it holds money (the company keeps what was paid unless it was refunded), so Accounts agrees with the
 * agent statements and the payments log; deleted-trip bookings with nothing paid are left out (they are just noise).
 */
async function loadBookings(f: AccountsFilter) {
  const from = periodStart(f.period);
  const where: Prisma.BookingWhereInput = {
    deletedAt: null, status: { in: ["ACTIVE", "CANCELLED"] },
    trip: { ...(f.hideArchived ? { archivedAt: null } : {}), ...(from ? { createdAt: { gte: from } } : {}) }, // archived trips count unless hidden
  };
  const rows = await db.booking.findMany({
    where, include: { pilgrim: true, trip: true, agent: true, payments: true },
    orderBy: [{ trip: { createdAt: "desc" } }, { tripId: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((b) => ({
    b, status: b.status as "ACTIVE" | "CANCELLED",
    price: b.priceAmount, paid: paidTotal(b.payments.map((p) => ({ kind: p.kind, credited: Number(p.credited) }))),
  })).filter((r) => !r.b.trip.deletedAt || Math.abs(r.paid) > 0.004);
}

export async function accountsOverview(f: AccountsFilter) {
  const rows = await loadBookings(f);
  const agents = await db.agent.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const overrides = await commissionOverrides(rows.map((r) => r.b.tripId));

  // trips tab: one row per trip, newest created first
  const byTrip = new Map<string, typeof rows>();
  for (const r of rows) byTrip.set(r.b.tripId, [...(byTrip.get(r.b.tripId) ?? []), r]);
  const tripRows = [...byTrip.values()].map((list) => ({ trip: list[0].b.trip, deleted: !!list[0].b.trip.deletedAt, pilgrims: list.filter((x) => x.status === "ACTIVE").length, ...accountTotals(list) }));
  tripRows.sort((a, b) => b.trip.createdAt.getTime() - a.trip.createdAt.getTime() || (a.trip.id < b.trip.id ? 1 : -1));

  // pilgrims tab: one row per booking, optionally filtered by trip / agent / only those who still owe
  let pilgrimRows = rows.map((r) => {
    const t = accountTotals([r]);
    return { bookingId: r.b.id, name: fullNameAr(r.b.pilgrim), trip: r.b.trip, deleted: !!r.b.trip.deletedAt, agent: r.b.agent, status: r.status, ...t };
  });
  if (f.trip) pilgrimRows = pilgrimRows.filter((r) => r.trip.id === f.trip);
  if (f.agent) pilgrimRows = pilgrimRows.filter((r) => r.agent?.id === f.agent);
  if (f.onlyDue) pilgrimRows = pilgrimRows.filter((r) => r.remaining > 0.005);

  // agents tab: one row per agent
  const agentPayments = await db.payment.findMany({
    where: { booking: { deletedAt: null, trip: { ...(f.hideArchived ? { archivedAt: null } : {}), ...(periodStart(f.period) ? { createdAt: { gte: periodStart(f.period)! } } : {}) } } },
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
      commission: agentCommission(mine.map((r) => ({ ...r, fixed: resolveCommission(overrides.get(`${r.b.tripId}:${a.id}`), r.b.trip.agentCommission) }))),
    };
  }).filter((a) => a.pilgrims > 0 || a.viaAgent || a.direct);

  const totals = accountTotals(rows);
  return { totals: { ...totals, commission: Math.round(agentRows.reduce((n, a) => n + a.commission, 0) * 100) / 100 }, tripRows, pilgrimRows, agentRows, agents };
}

export const LOG_PAGE_SIZE = 100;

/** The payments log: one page of rows (newest first) plus the totals of EVERYTHING the filter matches, not only the visible page. */
export async function paymentsLog(period: Period, q?: string, page = 1) {
  const from = periodStart(period);
  const term = (q ?? "").trim();
  const where: Prisma.PaymentWhereInput = {
    booking: { deletedAt: null },
    ...(from ? { paidAt: { gte: from } } : {}),
    ...(term ? { OR: [
      ...(/^\d+$/.test(term) ? [{ receiptNo: Number(term) }] : []),
      { booking: { pilgrim: { OR: term.split(/\s+/).map((w) => ({ OR: [{ firstName: { contains: w } }, { fatherName: { contains: w } }, { grandfatherName: { contains: w } }, { familyName: { contains: w } }, { enGivenName: { contains: w, mode: "insensitive" as const } }, { enSurname: { contains: w, mode: "insensitive" as const } }] })) } } },
    ] } : {}),
  };
  const [count, sums] = await Promise.all([db.payment.count({ where }), db.payment.groupBy({ by: ["kind"], where, _sum: { credited: true } })]);
  const pages = Math.max(1, Math.ceil(count / LOG_PAGE_SIZE));
  const cur = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const rows = await db.payment.findMany({
    where, include: { booking: { include: { pilgrim: true, trip: true } } },
    orderBy: [{ paidAt: "desc" }, { receiptNo: "desc" }], skip: (cur - 1) * LOG_PAGE_SIZE, take: LOG_PAGE_SIZE,
  });
  const agentIds = [...new Set(rows.map((r) => r.sourceAgentId).filter((x): x is string => !!x))];
  const agents = await db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } });
  const an = new Map(agents.map((a) => [a.id, a.name]));
  const sum = (k: "PAYMENT" | "REFUND") => Math.round(Number(sums.find((s) => s.kind === k)?._sum.credited ?? 0) * 100) / 100;
  const received = sum("PAYMENT"), refunded = sum("REFUND");
  return {
    rows: rows.map((p) => ({ ...p, pilgrimName: fullNameAr(p.booking.pilgrim), agentName: p.sourceAgentId ? an.get(p.sourceAgentId) ?? "" : "" })),
    count, page: cur, pages, totals: { received, refunded, net: Math.round((received - refunded) * 100) / 100 },
  };
}

export { TRIP_ORDER };
