/** Display name of a trip in lists, pickers and headings. The trip code is optional; the name is always set. */
export function tripLabel(t: { tripNo: string | null; name: string }): string {
  return t.tripNo ? `${t.tripNo} — ${t.name}` : t.name;
}

/** Text shown in printed documents for a missing value. */
export const NOT_SET = "غير محدد";
