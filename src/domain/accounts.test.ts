import { describe, it, expect } from "vitest";
import { accountTotals, agentCommission, parsePeriod, periodStart } from "./accounts";
import { can, ROLE_PERMISSIONS, type Role } from "@/lib/permissions";

describe("accounts definitions", () => {
  it("due = prices of non-cancelled bookings; received = payments - refunds; remaining = due - received", () => {
    const t = accountTotals([
      { status: "ACTIVE", price: 1000, paid: 400 },
      { status: "ACTIVE", price: 800, paid: 800 },
      { status: "CANCELLED", price: 900, paid: 150 }, // adds no due; the kept 150 is still money received
      { status: "ACTIVE", price: null, paid: 0 },     // no price yet adds nothing
    ]);
    expect(t).toMatchObject({ due: 1800, received: 1350, remaining: 450 });
    expect(t.percent).toBe(75);
  });
  it("percent is capped and zero without a due amount", () => {
    expect(accountTotals([{ status: "ACTIVE", price: 100, paid: 150 }]).percent).toBe(100);
    expect(accountTotals([]).percent).toBe(0);
    expect(accountTotals([{ status: "ACTIVE", price: 100, paid: 150 }]).remaining).toBe(-50);
  });
  it("a moved booking counts nowhere (its payments follow the new booking)", () => {
    expect(accountTotals([{ status: "MOVED", price: 500, paid: 500 }, { status: "ACTIVE", price: 500, paid: 500 }])).toMatchObject({ due: 500, received: 500 });
  });
  it("agent commission uses the agent-statement rules", () => {
    const rows = [{ status: "ACTIVE" as const, price: 1000, paid: 0, fixed: 100 }, { status: "CANCELLED" as const, price: 1000, paid: 0, fixed: 100 }, { status: "MOVED" as const, price: 1000, paid: 0, fixed: 100 }];
    expect(agentCommission(rows)).toBe(100);
  });
});

describe("period filter", () => {
  const now = new Date(Date.UTC(2026, 10, 20));
  it("parses and computes the start", () => {
    expect(parsePeriod("month")).toBe("month"); expect(parsePeriod("3m")).toBe("3m"); expect(parsePeriod("x")).toBe("all"); expect(parsePeriod(undefined)).toBe("all");
    expect(periodStart("all", now)).toBeNull();
    expect(periodStart("month", now)!.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(periodStart("3m", now)!.toISOString().slice(0, 10)).toBe("2026-08-20");
  });
});

describe("accounts permissions", () => {
  const roles = Object.keys(ROLE_PERMISSIONS) as Role[];
  it("every role can open the accounts and record a payment", () => {
    for (const r of roles) { expect(can(r, "payments.view"), r).toBe(true); expect(can(r, "payments.record"), r).toBe(true); }
  });
  it("only admin and accountant refund / cancel and edit prices", () => {
    for (const r of roles) {
      const priv = r === "ADMIN" || r === "ACCOUNTANT";
      expect(can(r, "payments.write"), r).toBe(priv);
      expect(can(r, "prices.write"), r).toBe(priv);
    }
  });
});
