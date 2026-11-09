import { addMonths } from "./dates";

export { normalizePassport as normalizePassportNo } from "./identity";

/** Warn when the passport expires before (returnDate + minMonths). A trip without a return date is skipped silently. */
export function passportExpiryWarning(expiry: Date, returnDate: Date | null | undefined, minMonths = 6): string | null {
  if (!returnDate) return null;
  const limit = addMonths(returnDate, minMonths);
  return expiry.getTime() < limit.getTime()
    ? `ينتهي جواز السفر قبل أقل من ${minMonths} أشهر من تاريخ العودة`
    : null;
}
