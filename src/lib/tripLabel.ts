import { formatDate } from "@/domain/dates";

/** Display name of a trip in lists, pickers and headings. The trip code is optional; the name is always set. */
export function tripLabel(t: { tripNo: string | null; name: string }): string {
  return t.tripNo ? `${t.tripNo} — ${t.name}` : t.name;
}

/** Text shown for a missing value (screens and printed documents). */
export const NOT_SET = "غير محدد";

/** DD/MM/YYYY of a date-only value, or "غير محدد" when missing. Never prints null or 1970. */
export function dateOrNotSet(d: Date | null | undefined): string {
  return d ? formatDate(d) : NOT_SET;
}

/** "15/11/2026 ← 27/11/2026"; each missing end shows "غير محدد"; both missing shows a single phrase. */
export function dateRangeLabel(depart: Date | null | undefined, ret: Date | null | undefined): string {
  if (!depart && !ret) return "التواريخ غير محددة";
  return `${dateOrNotSet(depart)} ← ${dateOrNotSet(ret)}`;
}
