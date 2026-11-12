/**
 * A suggestion for the English (passport) spelling of an Arabic name. It is only a starting point: common Iraqi names use the
 * spelling usually printed on passports, everything else is letter-by-letter. The user always checks it against the passport.
 */
const NAMES: Record<string, string> = {
  محمد: "MOHAMMED", احمد: "AHMED", علي: "ALI", حسين: "HUSSEIN", حسن: "HASSAN", عمر: "OMAR", يوسف: "YOUSIF", خالد: "KHALID",
  ابراهيم: "IBRAHIM", مصطفى: "MUSTAFA", سعد: "SAAD", ياسر: "YASIR", ثامر: "THAMER", عبدالله: "ABDULLAH", عبدالرحمن: "ABDULRAHMAN",
  عبدالكريم: "ABDULKARIM", عبدالعزيز: "ABDULAZIZ", عبدالرزاق: "ABDULRAZZAQ", صالح: "SALIH", سالم: "SALIM", محمود: "MAHMOOD", جاسم: "JASIM",
  كاظم: "KADHIM", نوري: "NOORI", طه: "TAHA", ياسين: "YASEEN", ادريس: "IDRIS", اسماعيل: "ISMAIL", داود: "DAWOOD", سليمان: "SULAIMAN",
  فاطمة: "FATIMA", زينب: "ZAINAB", مريم: "MARYAM", عائشة: "AISHA", سارة: "SARA", نور: "NOOR", هدى: "HUDA", اسماء: "ASMAA", رقية: "RUQAYA", خديجة: "KHADIJA",
};
const LETTERS: Record<string, string> = {
  ا: "A", أ: "A", إ: "E", آ: "A", ء: "", ب: "B", ت: "T", ث: "TH", ج: "J", ح: "H", خ: "KH", د: "D", ذ: "TH", ر: "R", ز: "Z", س: "S", ش: "SH", ص: "S",
  ض: "D", ط: "T", ظ: "Z", ع: "A", غ: "GH", ف: "F", ق: "Q", ك: "K", ل: "L", م: "M", ن: "N", ه: "H", و: "W", ي: "Y", ى: "A", ة: "A", ئ: "", ؤ: "",
};

const norm = (w: string) => w.replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ى").trim();

export function transliterateWord(word: string): string {
  const w = norm(word);
  if (!w) return "";
  const known = NAMES[w] ?? NAMES[w.replace(/^ال/, "")];
  if (known) return known;
  return [...w].map((c) => LETTERS[c] ?? (/[A-Za-z]/.test(c) ? c.toUpperCase() : "")).join("").replace(/(.)\1{2,}/g, "$1$1");
}

/** «علي حسين محمد» → { given: "ALI", father: "HUSSEIN", grandfather: "MOHAMMED" } (the first three words). */
export function suggestEnglishNames(fullNameAr: string): { given: string; father: string; grandfather: string } {
  const [a = "", b = "", c = ""] = fullNameAr.trim().split(/\s+/);
  return { given: transliterateWord(a), father: transliterateWord(b), grandfather: transliterateWord(c) };
}

/** Surname: «الجبوري» → «ALJUBOURI» style when the Arabic surname is given (the article joins the word). */
export function suggestSurname(familyAr: string): string {
  const w = norm(familyAr);
  if (!w) return "";
  const base = transliterateWord(w.replace(/^ال/, ""));
  return w.startsWith("ال") ? "AL" + base : base;
}
