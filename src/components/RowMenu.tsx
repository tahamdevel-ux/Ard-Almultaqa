"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** A «⋯» button that opens a small menu of actions. Closes on outside click, Escape, or after choosing an item. */
export function RowMenu({ label = "إجراءات", children, align = "end" }: { label?: string; children: ReactNode; align?: "end" | "start" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} className="icon-btn" onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && <div role="menu" className={"menu-panel " + (align === "start" ? "start-0 end-auto" : "")} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>}
    </div>
  );
}
