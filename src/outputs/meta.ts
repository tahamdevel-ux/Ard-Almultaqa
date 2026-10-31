import { formatDate } from "@/domain/dates";

/** Joins the non-empty parts. Missing values simply drop out, so a header never prints null, undefined or "Invalid Date". */
export function joinMeta(parts: (string | null | undefined | false)[], sep = " — "): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(sep);
}

/** "الرحلة L-2611" when the trip has a code, otherwise its name (always set), then the departure date if known. */
export function tripMetaParts(trip: { tripNo: string | null; name: string; departDate: Date | null }, lang: "ar" | "en" = "ar"): string[] {
  const label = trip.tripNo ? (lang === "ar" ? `الرحلة ${trip.tripNo}` : `Trip ${trip.tripNo}`) : trip.name;
  return [label, ...(trip.departDate ? [formatDate(trip.departDate)] : [])];
}
