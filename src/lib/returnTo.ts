/** Only internal paths are accepted as a return target (no other site, no protocol-relative URL). */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\r\n]/.test(raw)) return null;
  try { const u = new URL(raw, "http://x.invalid"); if (u.host !== "x.invalid") return null; } catch { return null; }
  return raw;
}

/** Adds or replaces a query parameter on an internal path. */
export function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, "http://x.invalid");
  u.searchParams.set(key, value);
  return u.pathname + u.search + u.hash;
}
