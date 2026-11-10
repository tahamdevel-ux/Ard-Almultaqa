"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** One search box for a trip's pilgrims list: updates the page as the user types (debounced). */
export function TripSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (q.trim()) next.set("q", q.trim()); else next.delete("q");
      router.replace(`${path}${next.toString() ? `?${next}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="بحث داخل الرحلة" className="input w-full max-w-md" />;
}
