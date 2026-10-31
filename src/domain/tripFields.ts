import { parseDate } from "./dates";

export interface TripIdentityInput { tripNo?: string | null; departDate?: string | null; returnDate?: string | null }
export type TripIdentityResult =
  | { ok: true; tripNo: string | null; departDate: Date | null; returnDate: Date | null }
  | { ok: false; error: string };

/**
 * Trip code, departure and return dates are all optional. Empty or blank input becomes null (never an empty string).
 * A filled date must be a valid DD/MM/YYYY, and when both dates are filled the return cannot be before the departure.
 */
export function parseTripIdentity(input: TripIdentityInput): TripIdentityResult {
  const tripNo = (input.tripNo ?? "").trim() || null;
  const rawDepart = (input.departDate ?? "").trim();
  const rawReturn = (input.returnDate ?? "").trim();
  const departDate = rawDepart ? parseDate(rawDepart) : null;
  const returnDate = rawReturn ? parseDate(rawReturn) : null;
  if (rawDepart && !departDate) return { ok: false, error: "تاريخ الذهاب غير صحيح (DD/MM/YYYY)" };
  if (rawReturn && !returnDate) return { ok: false, error: "تاريخ العودة غير صحيح (DD/MM/YYYY)" };
  if (departDate && returnDate && returnDate.getTime() < departDate.getTime()) return { ok: false, error: "تاريخ العودة لا يمكن أن يسبق تاريخ الذهاب" };
  return { ok: true, tripNo, departDate, returnDate };
}
