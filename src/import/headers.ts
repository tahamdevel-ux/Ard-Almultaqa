import { normalizeSearch } from "@/domain/searchNorm";
import { normalizeDate, normalizeGender, normalizeImportPhone, scriptOf, text, isBlank, type Cell } from "./values";

export type Mapping = Record<string, number | null>;
export type MapSource = "header" | "content";

/** Lower-case, Arabic-insensitive header with punctuation turned into spaces: "First Name (A)" -> "first name a". */
export function normHeader(h: Cell | undefined): string {
  return normalizeSearch(text(h)).replace(/[()\[\]{}_\-:.\/\\,;|*#]+/g, " ").replace(/\s+/g, " ").trim();
}

// Columns we recognise but never import (so content inference can't grab them either).
const IGNORED = /\b(visa|mahram|relation|group|age|client|hotel|room|entry|nights?|e number|enumber|mofa|marital|martial|education|occupation|job|title|national id|companion|prev|serial|religion|status|type|country|duration|azizia|makkah|madina|madinah)\b|تاشير|محرم|صله|مجموعه|العمر|فندق|غرف|ليال|مهنه|حاله اجتماعيه|الحاله|نوع|دوله|تحريري/;

type Part = "first" | "father" | "third" | "last" | "full";
interface NameInfo { part: Part; lang: "ar" | "en" | null }

export function nameInfo(h: string): NameInfo | null {
  if (!h) return null;
  let lang: "ar" | "en" | null = null;
  if (/(^| )(a|ar|arabic)( |$)|^a(?=full)|عربي|بالعربي/.test(h)) lang = "ar";
  else if (/(^| )(e|en|eng|english)( |$)|^e(?=full)|انكليزي|انجليزي|بالانكليزي|بالانجليزي/.test(h)) lang = "en";
  if (!lang && /(^| )(given|surname)( |$)/.test(h)) lang = "en"; // these words are used for the Latin-script names
  const g = h.replace(/^(a|e)(?=full)/, "");
  let part: Part | null = null;
  if (/grand ?father|third( name)?|اسم الجد|^الجد$|الاسم الثالث/.test(g)) part = "third";
  else if (/father|^اسم الاب|^الاب$|اسم الاب/.test(g)) part = "father";
  else if (/last( name)?|family|surname|لقب|عشيره|الاسم الاخير/.test(g)) part = "last";
  else if (/full ?name|الاسم الكامل|الاسم الثلاثي|الاسم الرباعي|اسم المعتمر|اسم المسافر/.test(g)) part = "full";
  else if (/first( name)?|given|الاسم الاول|اسم اول|^الاسم$|^name$|^اسم$/.test(g)) part = /^الاسم$|^name$|^اسم$/.test(g) ? "full" : "first";
  if (/mother|والده|^الام$|اسم الام/.test(g)) return null;
  return part ? { part, lang } : null;
}

interface Rule { field: string; re: RegExp; not?: RegExp }
const RULES: Rule[] = [
  { field: "passportType", re: /passport type|نوع الجواز/ },
  { field: "passportNo", re: /passport( number| no| num)?$|رقم الجواز|^الجواز$|جواز السفر|pass ?no/, not: /type|issue|expiry|date|country|نوع|تاريخ/ },
  { field: "birthDate", re: /birth date|date of birth|^dob$|birthdate|تاريخ الميلاد|^الميلاد$|تولد/ },
  { field: "placeOfBirth", re: /birth place|place of birth|محل الولاده|مكان الولاده|محل الميلاد/ },
  { field: "passportIssue", re: /issue date|date of issue|تاريخ الاصدار|تاريخ اصدار/ },
  { field: "passportAuthority", re: /issue place|issued by|authority|جهه الاصدار|جهة الاصدار|مكان الاصدار/ },
  { field: "passportExpiry", re: /expiry|expiration|expire|تاريخ الانتهاء|انتهاء الجواز|تاريخ انتهاء/ },
  { field: "gender", re: /^gender$|^sex$|^الجنس$|النوع الاجتماعي/ },
  { field: "nationality", re: /^nationality$|^الجنسيه$|^جنسيه$/ , not: /prev/ },
  { field: "phone", re: /phone|mobile|^tel$|telephone|^gsm$|هاتف|موبايل|^جوال$|رقم الهاتف/, not: /emergency|طوارئ|طوارىء/ },
  { field: "emergencyPhone", re: /emergency|هاتف الطوارئ|هاتف الطوارىء/ },
  { field: "motherName", re: /^mother( name)?$|اسم الام|^الام$|والده/ },
  { field: "address", re: /^address$|العنوان|السكن/ },
];

export function matchHeader(raw: Cell | undefined): string | null {
  const h = normHeader(raw);
  if (!h) return null;
  const ni = nameInfo(h);
  if (ni) return "name:" + ni.part + ":" + (ni.lang ?? "?");
  for (const r of RULES) if (r.re.test(h) && !(r.not && r.not.test(h))) return r.field;
  return null;
}

const FIELD_BY_PART: Record<"ar" | "en", Record<Part, string>> = {
  ar: { first: "firstName", father: "fatherName", third: "grandfatherName", last: "familyName", full: "fullNameAr" },
  en: { first: "enGivenName", father: "enFatherName", third: "enGrandfatherName", last: "enSurname", full: "fullNameEn" },
};

const PASSPORT_RE = /^[A-Za-z]{1,2}\d{6,9}$/;
export const looksLikePassport = (v: Cell | undefined) => typeof v === "string" && PASSPORT_RE.test(v.replace(/\s+/g, ""));

interface ColProfile { filled: number; script: "ar" | "en" | null; passport: number; phone: number; date: number; gender: number; avgWords: number; medianYear: number | null }

function profile(rows: Cell[][], col: number): ColProfile {
  let filled = 0, ar = 0, en = 0, passport = 0, phone = 0, date = 0, gender = 0, words = 0;
  const years: number[] = [];
  for (const r of rows) {
    const v = r[col];
    if (isBlank(v)) continue;
    filled++;
    const t = text(v);
    const sc = scriptOf(t);
    if (sc === "ar") ar++; else if (sc === "en") en++;
    if (looksLikePassport(v)) passport++;
    if (normalizeImportPhone(v) && !(v instanceof Date)) phone++;
    const d = normalizeDate(v);
    if (d && !(typeof v === "number" && v < 20000)) { date++; years.push(+d.slice(6)); }
    if (normalizeGender(v)) gender++;
    words += t.split(" ").length;
  }
  years.sort((a, b) => a - b);
  return { filled, script: ar >= en && ar > 0 ? "ar" : en > 0 ? "en" : null, passport, phone, date, gender, avgWords: filled ? words / filled : 0, medianYear: years.length ? years[Math.floor(years.length / 2)] : null };
}

export interface Guess { mapping: Mapping; sources: Record<string, MapSource>; }

/** Maps columns to fields from header text first, then from what the cells look like. `rows` are the data rows below the header. */
export function guessMapping(headers: Cell[], rows: Cell[][]): Guess {
  const mapping: Mapping = {};
  const sources: Record<string, MapSource> = {};
  const used = new Set<number>();
  const set = (field: string, col: number, src: MapSource) => {
    if (mapping[field] != null || used.has(col)) return false;
    mapping[field] = col; sources[field] = src; used.add(col); return true;
  };
  const sample = rows.slice(0, 200);
  const prof = headers.map((_, i) => profile(sample, i));
  const hs = headers.map(normHeader);

  // 1) explicit name columns: language from the header, or from the cell text when the header doesn't say
  const nameCols = hs.map((h, i) => ({ i, info: nameInfo(h) })).filter((x) => x.info);
  const explicit = nameCols.filter((x) => x.info!.lang).sort((a, b) => a.i - b.i);
  for (const { i, info } of explicit) set(FIELD_BY_PART[info!.lang!][info!.part], i, "header");
  for (const { i, info } of nameCols.filter((x) => !x.info!.lang)) {
    const sc = prof[i].script ?? "ar";
    let part = info!.part;
    // a bare "Name" column holding several words is a full name, with one word it is the first name
    if (part === "full" && /^(name|الاسم|اسم)$/.test(hs[i]) && prof[i].avgWords < 1.6) part = "first";
    set(FIELD_BY_PART[sc][part], i, "header");
  }
  // 2) other header rules
  hs.forEach((h, i) => {
    if (!h || nameInfo(h)) return;
    for (const r of RULES) if (r.re.test(h) && !(r.not && r.not.test(h))) { set(r.field, i, "header"); break; }
  });

  // 3) content inference for what is still missing; known-irrelevant columns are never taken
  const free = (pred: (p: ColProfile) => boolean) => headers.map((_, i) => i).filter((i) => !used.has(i) && !IGNORED.test(hs[i]) && prof[i].filled >= Math.max(1, sample.length * 0.3) && pred(prof[i]));
  const frac = (n: number, p: ColProfile) => n / Math.max(1, p.filled);
  if (mapping.passportNo == null) {
    const c = free((p) => frac(p.passport, p) >= 0.6).sort((a, b) => prof[b].passport - prof[a].passport)[0];
    if (c != null) set("passportNo", c, "content");
  }
  if (mapping.gender == null) {
    const c = free((p) => frac(p.gender, p) >= 0.8)[0];
    if (c != null) set("gender", c, "content");
  }
  if (mapping.phone == null) {
    const c = free((p) => frac(p.phone, p) >= 0.6)[0];
    if (c != null) set("phone", c, "content");
  }
  const dateCols = free((p) => frac(p.date, p) >= 0.7);
  const nowY = new Date().getUTCFullYear();
  for (const c of dateCols) {
    const y = prof[c].medianYear!;
    const field = y < 2008 ? "birthDate" : y >= nowY - 1 ? "passportExpiry" : "passportIssue";
    set(field, c, "content");
  }
  // names by script when no header told us (e.g. a sheet without headers): leftmost Arabic text columns, then Latin ones
  const wanted = (lang: "ar" | "en") => Object.values(FIELD_BY_PART[lang]).filter((f) => f !== (lang === "ar" ? "fullNameAr" : "fullNameEn"));
  for (const lang of ["ar", "en"] as const) {
    if (wanted(lang).some((f) => mapping[f] != null) || mapping[FIELD_BY_PART[lang].full] != null) continue;
    const cols = free((p) => p.script === lang && p.passport === 0 && p.date === 0 && p.gender === 0 && p.phone === 0 && p.avgWords <= 2.5);
    const fields = wanted(lang);
    // a single wide text column is a full name
    const wide = free((p) => p.script === lang && p.avgWords >= 2.5 && p.date === 0)[0];
    if (cols.length >= 3) cols.slice(0, 4).forEach((c, k) => set(fields[k], c, "content"));
    else if (wide != null) set(FIELD_BY_PART[lang].full, wide, "content");
  }
  return { mapping, sources };
}

export interface SheetAnalysis {
  name: string;
  headerRow: number; // 1-based sheet row of the headers, 0 = none (data starts at row 1)
  headers: string[];
  dataRows: { rowNo: number; cells: Cell[] }[];
  mapping: Mapping;
  sources: Record<string, MapSource>;
  ready: boolean; // every essential field found
  score: number;
}

const ESSENTIAL_NAME = (m: Mapping) => (m.firstName != null || m.fullNameAr != null);

/** Finds the header row among the first 30 rows: the row whose cells match the most known headers. */
export function detectHeaderRow(raw: Cell[][]): number {
  let best = -1, bestScore = 0;
  raw.slice(0, 30).forEach((r, i) => {
    const hits = new Set(r.map(matchHeader).filter(Boolean) as string[]);
    if (hits.size > bestScore) { bestScore = hits.size; best = i; }
  });
  if (bestScore >= 2) return best + 1;
  const first = raw.find((r) => r.some((c) => !isBlank(c)));
  if (first && first.some(looksLikePassport)) return 0; // headerless sheet
  return bestScore >= 1 ? best + 1 : 1;
}

export function analyzeSheet(name: string, raw: Cell[][], forcedHeaderRow?: number): SheetAnalysis {
  const headerRow = forcedHeaderRow ?? detectHeaderRow(raw);
  const width = Math.max(0, ...raw.map((r) => r.length));
  const headerCells = headerRow > 0 ? raw[headerRow - 1] ?? [] : [];
  const headers = Array.from({ length: width }, (_, i) => (headerRow > 0 ? text(headerCells[i]) : ""));
  const dataRows = raw
    .map((cells, i) => ({ rowNo: i + 1, cells }))
    .filter((r) => r.rowNo > headerRow && r.cells.some((c) => !isBlank(c)));
  const { mapping, sources } = guessMapping(headers, dataRows.map((r) => r.cells));
  const ready = mapping.passportNo != null && ESSENTIAL_NAME(mapping);
  const score = Object.values(mapping).filter((v) => v != null).length * 100 + Math.min(dataRows.length, 99);
  return { name, headerRow, headers, dataRows, mapping, sources, ready, score };
}
