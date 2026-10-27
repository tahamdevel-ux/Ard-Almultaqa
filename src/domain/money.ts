export type CurrencyKey = "IQD" | "USD";
/** `credited` = value counted toward the booking, in the booking's currency (after conversion). */
export interface PaymentLike { kind: "PAYMENT" | "REFUND"; credited: number }

export const CURRENCY_LABELS: Record<CurrencyKey, string> = { IQD: "دينار", USD: "دولار" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatMoney(amount: number, currency: CurrencyKey): string {
  const abs = Math.abs(amount);
  const n = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = amount < 0 ? "-" : "";
  return currency === "USD" ? `${sign}$${n}` : `${sign}${n} د.ع`;
}

/**
 * Value of a payment in the booking's currency. Same currency -> unchanged.
 * `rate` = dinars per 1 USD at the time of payment (required when currencies differ).
 */
export function creditedValue(amount: number, payCurrency: CurrencyKey, bookingCurrency: CurrencyKey, rate?: number | null): number | null {
  if (payCurrency === bookingCurrency) return amount;
  if (!rate || rate <= 0) return null;
  return round2(bookingCurrency === "USD" ? amount / rate : amount * rate);
}

export function paidTotal(payments: PaymentLike[]): number {
  return round2(payments.reduce((n, p) => n + (p.kind === "PAYMENT" ? p.credited : -p.credited), 0));
}

export function balance(price: number | null, payments: PaymentLike[]): number | null {
  return price == null ? null : round2(price - paidTotal(payments));
}

export interface PaymentInput { kind: "PAYMENT" | "REFUND"; amount: number; currency: CurrencyKey; rate?: number | null; reason?: string }

/** Returns { error } in Arabic, or { credited } when valid. */
export function checkPayment(p: PaymentInput, bookingCurrency: CurrencyKey, existing: PaymentLike[]): { error: string } | { credited: number } {
  if (!Number.isInteger(p.amount) || p.amount <= 0) return { error: "المبلغ يجب أن يكون رقماً صحيحاً أكبر من صفر" };
  const credited = creditedValue(p.amount, p.currency, bookingCurrency, p.rate);
  if (credited == null) return { error: "أدخل سعر الصرف (دينار لكل دولار) وقت التسديد" };
  if (p.kind === "REFUND") {
    if (!p.reason?.trim()) return { error: "سبب الاسترداد مطلوب" };
    if (credited > paidTotal(existing) + 0.005) return { error: "مبلغ الاسترداد أكبر من المدفوع" };
  }
  return { credited };
}

export interface AgentRule { type: "PERCENT" | "FIXED_WHOLESALE"; value: number }
export interface StatementBooking { price: number | null; paid: number; cancelled: boolean }

/**
 * Agent statement (one currency; bookings are priced in USD).
 * PERCENT: commission = value% of price. FIXED_WHOLESALE: the company's price per pilgrim is `value`, the agent keeps price - value.
 * dueToCompany = price - commission - collected (negative = overpaid). Cancelled bookings add no price/commission,
 * only what was actually kept (paid net of refunds).
 */
export function agentStatement(rows: StatementBooking[], rule: AgentRule) {
  let totalPrice = 0, commission = 0, collected = 0;
  for (const r of rows) {
    collected += r.paid;
    if (r.cancelled || r.price == null) continue;
    totalPrice += r.price;
    commission += rule.type === "PERCENT" ? round2((r.price * rule.value) / 100) : Math.max(0, r.price - rule.value);
  }
  const netToCompany = round2(totalPrice - commission);
  return { count: rows.filter((r) => !r.cancelled).length, totalPrice, commission: round2(commission), netToCompany, collected: round2(collected), dueToCompany: round2(netToCompany - collected) };
}
