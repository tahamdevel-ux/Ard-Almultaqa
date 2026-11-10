import { asciiDigits } from "./dateMask";

export type PassportType = "IRAQI" | "FOREIGN";

export const PASSPORT_ERRORS: Record<PassportType, string> = {
  IRAQI: "رقم الجواز العراقي يجب أن يكون حرفاً إنكليزياً واحداً و8 أرقام، مثل A12345678",
  FOREIGN: "رقم الجواز الأجنبي يجب أن يكون من 6 إلى 12 حرفاً أو رقماً إنكليزياً",
};
export const PHONE_ERROR = "رقم الهاتف يجب أن يكون عراقياً (11 رقم يبدأ بـ 07) أو سعودياً (10 أرقام يبدأ بـ 05)";

const PASSPORT_RULES: Record<PassportType, RegExp> = { IRAQI: /^[A-Z][0-9]{8}$/, FOREIGN: /^[A-Z0-9]{6,12}$/ };

/** Trim, remove all spaces, Arabic-Indic / Eastern Arabic digits -> 0-9, uppercase. The stored (and unique) form. */
export function normalizePassport(raw: string): string {
  return asciiDigits(raw).replace(/\s+/g, "").toUpperCase();
}

/** Returns an Arabic error, or null when the (normalized) number fits the passport type. */
export function validatePassport(normalized: string, type: PassportType = "IRAQI"): string | null {
  return PASSPORT_RULES[type].test(normalized) ? null : PASSPORT_ERRORS[type];
}

/** Removes spaces, dashes, dots and brackets; Arabic digits -> 0-9; +964 / 00964 and +966 / 00966 -> leading 0. */
export function normalizePhone(raw: string): string {
  let s = asciiDigits(raw).replace(/[\s\-.()\[\]]/g, "");
  s = s.replace(/^(?:\+|00)(?:964|966)/, "0");
  return s;
}

/** Iraq: 07 + 9 digits. Saudi Arabia: 05 + 8 digits. */
export function validatePhone(normalized: string): string | null {
  return /^07[0-9]{9}$/.test(normalized) || /^05[0-9]{8}$/.test(normalized) ? null : PHONE_ERROR;
}

/** Normalizes and validates in one step; empty input is allowed (returns null). */
export function checkPhone(raw: string | null | undefined): { value: string | null; error?: string } {
  const v = normalizePhone((raw ?? "").trim());
  if (!v) return { value: null };
  const error = validatePhone(v);
  return error ? { value: null, error } : { value: v };
}

/** A list of phones typed in one box (separated by comma, Arabic comma or space). Returns the normalized numbers or the first error. */
export function checkPhoneList(raw: string | null | undefined): { values: string[]; error?: string } {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[,،;\s]+/).filter(Boolean)) {
    const v = normalizePhone(part);
    const e = validatePhone(v);
    if (e) return { values: [], error: e };
    out.push(v);
  }
  return { values: out };
}

/**
 * What a phone box keeps while the user types or pastes: the value is normalized first (Arabic digits, spaces/dashes/dots/brackets,
 * +964 / 00964 / +966 / 00966 -> 0) and only then cut to at most 11 digits, so a pasted "+964 770 123 4567" is not truncated wrongly.
 */
export function limitPhoneInput(raw: string): string {
  return normalizePhone(raw).replace(/\D/g, "").slice(0, 11);
}

/** Same for a box holding several numbers (agent, company): each number is limited on its own; separators are kept as a comma. */
export function limitPhoneList(raw: string): string {
  const endsWithSep = /[,،;\s]$/.test(raw);
  const parts = raw.split(/[,،;]+|\s{2,}/).map((p) => p.trim()).filter(Boolean).map(limitPhoneInput).filter(Boolean);
  return parts.join("، ") + (endsWithSep && parts.length ? "، " : "");
}

/** Hard limit of the passport box: 9 characters for an Iraqi passport, 12 for a foreign one. */
export const passportMaxLength = (type: PassportType) => (type === "FOREIGN" ? 12 : 9);
