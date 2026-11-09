"use client";
import { useEffect, useState } from "react";

/** Success message that fades away by itself. */
export function Toast({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOpen(false), 4000); return () => clearTimeout(t); }, []);
  if (!open) return null;
  return <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{text}</p>;
}
