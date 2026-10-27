const IRAQ_MOBILE = /^07[3-9]\d{8}$/;

/** Converts Arabic-Indic digits to ASCII and strips separators / +964 prefix. */
export function normalizePhone(raw: string): string {
  const ascii = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let s = ascii.replace(/[\s\-().]/g, "");
  if (s.startsWith("+964")) s = "0" + s.slice(4);
  else if (s.startsWith("00964")) s = "0" + s.slice(5);
  else if (/^7[3-9]\d{8}$/.test(s)) s = "0" + s; // Excel drops the leading zero
  return s;
}

export function isIraqiMobile(raw: string): boolean {
  return IRAQ_MOBILE.test(normalizePhone(raw));
}

/** Emergency contacts may also be foreign numbers: accept 8–15 digits with optional +. */
export function isEmergencyPhone(raw: string): boolean {
  const s = normalizePhone(raw);
  return IRAQ_MOBILE.test(s) || /^\+?\d{8,15}$/.test(s);
}
