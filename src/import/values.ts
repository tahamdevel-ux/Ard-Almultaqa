import { asciiDigits } from "@/domain/dateMask";
import { formatDate } from "@/domain/dates";
import { normalizeSearch } from "@/domain/searchNorm";
import { isIraqiMobile, normalizePhone } from "@/domain/phone";

export type Cell = string | number | boolean | Date | null;

export const isBlank = (v: Cell | undefined): boolean => v == null || (typeof v === "string" && v.trim() === "");
export const text = (v: Cell | undefined): string => (v == null ? "" : v instanceof Date ? formatDate(v) : String(v).replace(/\s+/g, " ").trim());

/** Excel serial day number -> Date (1900 system). */
export function serialToDate(n: number): Date | null {
  if (!Number.isFinite(n) || n < 1 || n > 100000) return null;
  return new Date(Math.round((n - 25569) * 86400000));
}

/** Any common date form -> DD/MM/YYYY, or null. Handles Date objects, serials, DD-MM-YYYY, YYYY-MM-DD[ time], Arabic digits. */
export function normalizeDate(v: Cell | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : formatDate(v);
  if (typeof v === "number") {
    if (v >= 20000 && v <= 80000) { const d = serialToDate(v); return d ? formatDate(d) : null; }
    return null;
  }
  const s = asciiDigits(String(v)).trim();
  if (!s) return null;
  let m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T].*)?$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})(?:[ T].*)?$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if (/^\d{5}$/.test(s)) { const dt = serialToDate(+s); return dt ? formatDate(dt) : null; }
  else if ((m = /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2})$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3] + (+m[3] > 40 ? 1900 : 2000); }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return formatDate(dt);
}

export function normalizeGender(v: Cell | undefined): "MALE" | "FEMALE" | null {
  const s = normalizeSearch(text(v));
  if (!s) return null;
  if (/^(male|m|ذكر|ر|رجل|man)$/.test(s)) return "MALE";
  if (/^(female|f|انثي|انثى|ث|امراه|woman)$/.test(s)) return "FEMALE";
  return null;
}

/** "IRAQ", "Iraqi", "عراقي", "العراق" -> IRAQI. Anything else is kept (uppercased). */
export function normalizeNationality(v: Cell | undefined): string {
  const raw = text(v);
  if (!raw) return "IRAQI";
  const s = normalizeSearch(raw);
  if (/iraq|عراق/.test(s)) return "IRAQI";
  return raw.toUpperCase();
}

/** 7701234567, +9647701234567, 009647701234567, ٠٧٧٠… -> 07701234567; null when it cannot be a valid Iraqi mobile. */
export function normalizeImportPhone(v: Cell | undefined): string | null {
  if (v == null) return null;
  let d = asciiDigits(typeof v === "number" ? String(Math.round(v)) : String(v)).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00964")) d = d.slice(5); else if (d.startsWith("964")) d = d.slice(3);
  if (d.length === 10 && d.startsWith("7")) d = "0" + d;
  const p = normalizePhone(d);
  return isIraqiMobile(p) ? p : null;
}

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
const hasLatin = (s: string) => /[A-Za-z]/.test(s);
export const scriptOf = (s: string): "ar" | "en" | null => (hasArabic(s) ? "ar" : hasLatin(s) ? "en" : null);

// words that glue to the next / previous word to form one name
const AR_PREFIX = new Set(["عبد", "عبيد", "ابو", "ابي", "ام", "ابن", "بن", "مال"]);
const AR_SUFFIX = new Set(["الدين", "الله", "الرحمن", "الرحيم", "الحق", "الاسلام", "الهدي", "الهدى", "الامير", "الرضا", "الرسول", "العابدين"]);
const EN_PREFIX = new Set(["abd", "abdul", "abu", "bin", "ibn", "al", "el", "abdel", "abdal"]);

function glue(tokens: string[], lang: "ar" | "en"): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    const key = lang === "ar" ? normalizeSearch(t) : t.toLowerCase();
    if (lang === "ar" && AR_SUFFIX.has(key) && out.length) { out[out.length - 1] += " " + t; continue; }
    const pref = lang === "ar" ? AR_PREFIX.has(key) : EN_PREFIX.has(key);
    if (pref && i + 1 < tokens.length) { t += " " + tokens[i + 1]; i++; }
    out.push(t);
  }
  return out;
}

export interface SplitName { first?: string; father?: string; grandfather?: string; greatGrandfather?: string; family?: string }

/** Splits a full name. 4+ words: first, father, grandfather, family (= last); extra middle words go to the great-grandfather. */
export function splitFullName(full: string, lang: "ar" | "en"): SplitName {
  const tokens = glue(full.replace(/\s+/g, " ").trim().split(" ").filter(Boolean), lang);
  if (tokens.length === 0) return {};
  if (tokens.length === 1) return { first: tokens[0] };
  if (tokens.length === 2) return { first: tokens[0], father: tokens[1] };
  if (tokens.length === 3) return { first: tokens[0], father: tokens[1], family: tokens[2] };
  const out: SplitName = { first: tokens[0], father: tokens[1], grandfather: tokens[2], family: tokens[tokens.length - 1] };
  if (tokens.length > 4) out.greatGrandfather = tokens.slice(3, -1).join(" ");
  return out;
}

/**
 * The form's single "triple name" box: first, father, grandfather. Compound names stay together
 * ("عبد الله", "صلاح الدين"). More than three words: the rest goes to the grandfather. Two words are accepted
 * (grandfather stays empty); one word is rejected by the caller.
 */
export function splitTripleName(full: string): { first: string; father: string; grandfather: string } {
  const t = glue(full.replace(/\s+/g, " ").trim().split(" ").filter(Boolean), "ar");
  return { first: t[0] ?? "", father: t[1] ?? "", grandfather: t.slice(2).join(" ") };
}
