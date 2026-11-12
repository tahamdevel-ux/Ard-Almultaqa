"use client";
import { useEffect, useRef } from "react";

/** For a <details> popover: closes on any click outside it and when `done` turns true (e.g. after a successful save). */
export function usePopover(done: unknown) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => { const d = ref.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);
  useEffect(() => { if (done && ref.current) ref.current.open = false; }, [done]);
  return ref;
}
