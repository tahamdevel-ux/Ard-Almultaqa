import { addMonths } from "./dates";
import { agentStatement, type AgentRule } from "./money";

export type Period = "all" | "month" | "3m";
export const PERIOD_LABELS: Record<Period, string> = { month: "هذا الشهر", "3m": "آخر 3 أشهر", all: "الكل" };

export function parsePeriod(v: string | null | undefined): Period {
  return v === "month" || v === "3m" ? v : "all";
}

/** Start (UTC midnight) of the period, or null for "all". "This month" = from the 1st of the current month; "last 3 months" = from 3 months ago. */
export function periodStart(period: Period, now: Date = new Date()): Date | null {
  if (period === "all") return null;
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const t = addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -3);
  return t;
}

export interface AccountRow { status: "ACTIVE" | "CANCELLED" | "MOVED"; price: number | null; paid: number }

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The accounts definitions (USD):
 *  due       = المطلوب  = sum of prices of non-cancelled bookings
 *  received  = المستلم  = sum of payments minus refunds (cancelled bookings keep what the company kept)
 *  remaining = الباقي   = due - received
 */
export function accountTotals(rows: AccountRow[]) {
  let due = 0, received = 0;
  for (const r of rows) {
    if (r.status === "ACTIVE" && r.price != null) due += r.price;
    if (r.status !== "MOVED") received += r.paid; // a moved booking's payments are re-pointed to the new booking
  }
  due = round2(due); received = round2(received);
  return { due, received, remaining: round2(due - received), percent: due > 0 ? Math.max(0, Math.min(100, Math.round((received / due) * 100))) : 0 };
}

/** Commission of one agent over his bookings, exactly as the agent statement computes it. */
export function agentCommission(rows: { status: AccountRow["status"]; price: number | null; paid: number; fixed?: number }[], rule: AgentRule): number {
  return agentStatement(rows.filter((r) => r.status !== "MOVED").map((r) => ({ price: r.price, paid: r.paid, cancelled: r.status === "CANCELLED", fixed: r.fixed })), rule).commission;
}
