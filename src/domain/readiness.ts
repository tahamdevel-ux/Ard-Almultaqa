export interface ReadinessInput {
  bookingActive: boolean;
  docs: string[]; // document types present
  visaStatus: "NOT_SUBMITTED" | "IN_PROGRESS" | "ISSUED" | "REJECTED";
}
export const REQUIRED_DOC_TYPES = ["PASSPORT", "PHOTO"] as const;
const DOC_AR: Record<string, string> = { PASSPORT: "صورة الجواز", PHOTO: "الصورة الشخصية" };

/** "Ready to travel" only when required documents are uploaded AND the visa is ISSUED. */
export function readiness(i: ReadinessInput): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const t of REQUIRED_DOC_TYPES) if (!i.docs.includes(t)) missing.push(`ناقص: ${DOC_AR[t]}`);
  if (i.visaStatus !== "ISSUED") missing.push("التأشيرة لم تصدر");
  return { ready: i.bookingActive && missing.length === 0, missing };
}
