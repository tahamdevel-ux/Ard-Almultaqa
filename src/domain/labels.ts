/** Wording for numbers that can look wrong: no capacity, over capacity, money paid beyond the price. */
export function seatsLabel(registered: number, capacity: number): { text: string; tone: "ok" | "bad" | "warn" } {
  if (capacity <= 0) return { text: `${registered} (حدد السعة)`, tone: "warn" };
  if (registered > capacity) return { text: `${registered} من ${capacity} — تجاوز السعة بـ ${registered - capacity}`, tone: "bad" };
  return { text: `${registered} من ${capacity}`, tone: "ok" };
}

/** Vacant seats as shown on a card: never negative. */
export function vacancyLabel(registered: number, capacity: number): string {
  if (capacity <= 0) return "—";
  return registered > capacity ? "0 (ممتلئة)" : String(capacity - registered);
}

/** Remaining amount: positive = owed (red), zero = settled, negative = paid beyond the price («زيادة مدفوعة», green). */
export function remainingState(amount: number): { kind: "owed" | "settled" | "extra"; abs: number } {
  const a = Math.round(amount * 100) / 100;
  return a > 0 ? { kind: "owed", abs: a } : a < 0 ? { kind: "extra", abs: -a } : { kind: "settled", abs: 0 };
}
