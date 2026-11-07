const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic and Persian digits to ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => String(ARABIC_INDIC.includes(c) ? ARABIC_INDIC.indexOf(c) : PERSIAN.indexOf(c)));
}

const SEP = /[\/\-.\s\\]/;

/**
 * Live formatting of a date typed as DD/MM/YYYY. The slashes are inserted automatically, so staff type digits only.
 * - digits only: "15112026" becomes "15/11/2026", "151" becomes "15/1"
 * - a typed separator ("/", "-", "." or a space) is accepted: "1/" becomes "01/", "5/3/2026" is kept until blur
 * - Arabic-Indic digits are converted; anything else is dropped; at most 8 digits are kept
 */
export function maskDateTyping(raw: string): string {
  const s = asciiDigits(raw);
  // Already-formatted text (two-digit parts) that keeps growing: spill into the next part.
  const prior = s.split(/[\/\-.\s\\]+/);
  const spill = SEP.test(s) && !SEP.test(s[s.length - 1]) && prior.slice(0, -1).every((p) => p.length === 2) && prior.length <= 3;
  if (SEP.test(s) && !spill) {
    const parts = s.split(/[\/\-.\s\\]+/).map((p) => p.replace(/\D/g, ""));
    const endsWithSep = SEP.test(s[s.length - 1]);
    const out: string[] = [];
    for (let i = 0; i < parts.length && out.length < 3; i++) {
      const last = i === parts.length - 1;
      let p = parts[i];
      if (i < 2) p = p.slice(0, 2); else p = p.slice(0, 4);
      if (p === "" && !last) continue; // repeated separators
      if (!last && p.length === 1) p = "0" + p; // "1/" becomes "01/"
      if (p === "" && last && !endsWithSep) continue;
      if (p !== "") out.push(p); else if (last && endsWithSep && out.length > 0 && out.length < 3) out.push("");
    }
    let joined = out.join("/");
    if (out.length > 0 && out[out.length - 1] === "") joined = out.slice(0, -1).join("/") + "/";
    return joined;
  }
  const d = s.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** On leaving the field: pad single-digit day and month ("5/3/2026" becomes "05/03/2026"). Incomplete input is left as typed. */
export function completeDate(raw: string): string {
  const m = maskDateTyping(raw);
  const parts = m.split("/");
  if (parts.length !== 3) return m.replace(/\/$/, "");
  return [parts[0].padStart(2, "0"), parts[1].padStart(2, "0"), parts[2]].join("/");
}
