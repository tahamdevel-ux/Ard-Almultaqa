"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HeadTag } from "@/components/HeadTag";
import type { SearchResults } from "@/server/search";

const EMPTY: SearchResults = { pilgrims: [], trips: [], agents: [], hotels: [] };

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (r.ok) setRes(await r.json());
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(h); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const total = res.pilgrims.length + res.trips.length + res.agents.length + res.hotels.length;
  const close = () => { setOpen(false); setQ(""); };
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border-b border-line last:border-0"><div className="bg-canvas px-3 py-1 text-xs font-bold text-brand-mid">{title}</div>{children}</div>
  );
  return (
    <div ref={box} className="relative w-40 sm:w-56 lg:w-72">
      <input
        type="search" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="بحث: اسم، جواز، هاتف، رحلة…" aria-label="بحث شامل"
        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-brand-mid"
      />
      {open && q.trim().length >= 2 && (
        <div role="listbox" className="absolute end-0 z-30 mt-1 max-h-[70vh] w-[min(92vw,26rem)] overflow-auto rounded-lg border border-line bg-white text-ink shadow-xl">
          {total === 0 && <p className="px-3 py-3 text-sm text-brand-mid">{loading ? "جارٍ البحث…" : "لا توجد نتائج"}</p>}
          {res.pilgrims.length > 0 && (
            <Group title="المعتمرون">
              {res.pilgrims.map((p) => (
                <Link key={p.id} href={`/pilgrims/${p.id}`} onClick={close} className="block px-3 py-2 hover:bg-canvas">
                  <div className="text-sm font-bold">{p.name}{p.head && <HeadTag />}</div>
                  <div className="ltr text-xs text-brand-mid">{p.sub}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.trips.length === 0 && <span className="chip">غير مسجّل في رحلة</span>}
                    {p.trips.map((t) => <span key={t.id} className={"chip " + (t.past ? "" : "chip-ok")}>{t.label} · {t.dates}{t.past ? " · سافر سابقاً" : ""}</span>)}
                  </div>
                </Link>
              ))}
            </Group>
          )}
          {res.trips.length > 0 && (
            <Group title="الرحلات">
              {res.trips.map((t) => <Link key={t.id} href={`/trips/${t.id}`} onClick={close} className="block px-3 py-2 hover:bg-canvas"><div className="text-sm font-bold">{t.label}</div><div className="text-xs text-brand-mid">{t.sub}</div></Link>)}
            </Group>
          )}
          {res.agents.length > 0 && (
            <Group title="الوكلاء">
              {res.agents.map((a) => <Link key={a.id} href={`/agents/${a.id}`} onClick={close} className="block px-3 py-2 hover:bg-canvas"><div className="text-sm font-bold">{a.name}</div><div className="text-xs text-brand-mid">{a.sub}</div></Link>)}
            </Group>
          )}
          {res.hotels.length > 0 && (
            <Group title="الفنادق">
              {res.hotels.map((h) => <Link key={h.id} href="/hotels" onClick={close} className="block px-3 py-2 hover:bg-canvas"><div className="text-sm font-bold">{h.name}</div><div className="text-xs text-brand-mid">{h.sub}</div></Link>)}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}
