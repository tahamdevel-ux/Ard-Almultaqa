import { addMonths } from "./dates";

export function normalizePassportNo(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Warn when the passport expires before (returnDate + minMonths). */
export function passportExpiryWarning(expiry: Date, returnDate: Date, minMonths = 6): string | null {
  const limit = addMonths(returnDate, minMonths);
  return expiry.getTime() < limit.getTime()
    ? `ينتهي جواز السفر قبل أقل من ${minMonths} أشهر من تاريخ العودة`
    : null;
}
