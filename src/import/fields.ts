export interface ImportField { key: string; label: string; required?: boolean; aliases: string[] }

export const IMPORT_FIELDS: ImportField[] = [
  { key: "firstName", label: "الاسم الأول", required: true, aliases: ["الاسم الاول", "الاسم الأول", "الاسم", "first name", "firstname"] },
  { key: "fatherName", label: "اسم الأب", required: true, aliases: ["اسم الاب", "اسم الأب", "الاب", "الأب", "father"] },
  { key: "grandfatherName", label: "اسم الجد", required: true, aliases: ["اسم الجد", "الجد", "grandfather"] },
  { key: "familyName", label: "اللقب", required: true, aliases: ["اللقب", "العشيرة", "family", "surname ar"] },
  { key: "gender", label: "الجنس", required: true, aliases: ["الجنس", "gender", "sex"] },
  { key: "birthDate", label: "تاريخ الميلاد", required: true, aliases: ["تاريخ الميلاد", "الميلاد", "birth", "dob"] },
  { key: "motherName", label: "اسم الأم", aliases: ["اسم الام", "اسم الأم", "الام", "mother"] },
  { key: "governorate", label: "المحافظة", aliases: ["المحافظة", "governorate"] },
  { key: "address", label: "العنوان", aliases: ["العنوان", "السكن", "address"] },
  { key: "phone", label: "الهاتف", aliases: ["الهاتف", "رقم الهاتف", "موبايل", "phone", "mobile"] },
  { key: "emergencyPhone", label: "هاتف الطوارئ", aliases: ["هاتف الطوارئ", "هاتف الطوارىء", "emergency"] },
  { key: "passportNo", label: "رقم الجواز", required: true, aliases: ["رقم الجواز", "الجواز", "passport", "passport no", "passport number"] },
  { key: "enGivenName", label: "Given name", required: true, aliases: ["given name", "given", "first name en", "الاسم بالانكليزي", "الاسم بالإنكليزي"] },
  { key: "enFatherName", label: "Father name", aliases: ["father name", "father en"] },
  { key: "enGrandfatherName", label: "Grandfather name", aliases: ["grandfather name", "grandfather en"] },
  { key: "enSurname", label: "Surname", required: true, aliases: ["surname", "last name", "اللقب بالانكليزي", "اللقب بالإنكليزي"] },
  { key: "nationality", label: "الجنسية", aliases: ["الجنسية", "nationality"] },
  { key: "placeOfBirth", label: "محل الولادة", aliases: ["محل الولادة", "place of birth"] },
  { key: "passportIssue", label: "تاريخ إصدار الجواز", aliases: ["تاريخ الاصدار", "تاريخ الإصدار", "issue date", "date of issue"] },
  { key: "passportExpiry", label: "تاريخ انتهاء الجواز", required: true, aliases: ["تاريخ الانتهاء", "انتهاء الجواز", "expiry", "date of expiry", "expiry date"] },
  { key: "passportAuthority", label: "جهة الإصدار", aliases: ["جهة الاصدار", "جهة الإصدار", "authority"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-:]+/g, " ").trim();

/** Guess a column index per field from header text. */
export function autoMap(headers: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const want = [f.label, ...f.aliases].map(norm);
    let idx = headers.findIndex((h, i) => !used.has(i) && want.includes(norm(h)));
    if (idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && want.some((w) => w.length > 3 && norm(h) === w));
    out[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return out;
}
