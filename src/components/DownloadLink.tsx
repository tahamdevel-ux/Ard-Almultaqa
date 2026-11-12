"use client";
import { useState, type ReactNode } from "react";

/** A download link that shows «جاري التجهيز…» while the file is built and refuses a second click meanwhile. */
export function DownloadLink({ href, children, className = "btn-secondary" }: { href: string; children: ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(href);
      if (!r.ok) throw new Error(r.status === 403 ? "ليست لديك صلاحية" : "تعذّر تجهيز الملف");
      const name = /filename="?([^";]+)"?/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "file";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = decodeURIComponent(name); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-col">
      <a href={href} onClick={go} aria-busy={busy} className={className + (busy ? " opacity-60 pointer-events-none" : "")}>{busy ? "جاري التجهيز…" : children}</a>
      {err && <span role="alert" className="text-xs font-bold text-red-700">{err}</span>}
    </span>
  );
}
