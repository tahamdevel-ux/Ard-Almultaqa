"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

type Item = { href: string; label: string; icon: IconName };
const PRIMARY = ["/dashboard", "/pilgrims", "/trips", "/accounts"];

/** Phone navigation: a bottom bar with the main sections and a «المزيد» sheet with everything else (shown below md only). */
export function MobileNav({ items }: { items: Item[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const main = items.filter((i) => PRIMARY.includes(i.href)), more = items.filter((i) => !PRIMARY.includes(i.href));
  const isActive = (h: string) => path === h || path.startsWith(h + "/");
  const cell = "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold";
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="المزيد">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-14 rounded-t-2xl bg-white p-3 shadow-2xl">
            <div className="grid grid-cols-3 gap-2">
              {more.map((n) => (
                <Link key={n.href} href={n.href} className={"flex min-h-[4rem] flex-col items-center justify-center gap-1 rounded-xl border border-line text-xs font-bold " + (isActive(n.href) ? "bg-brand text-white" : "text-brand-dark")}>
                  <Icon name={n.icon} size={20} />{n.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav aria-label="القائمة السفلية" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-brand-deeper text-white md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {main.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={cell + (isActive(n.href) ? " text-gold-bright" : " text-white/80")}>
            <Icon name={n.icon} size={20} />{n.label}
          </Link>
        ))}
        {more.length > 0 && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cell + (open || more.some((m) => isActive(m.href)) ? " text-gold-bright" : " text-white/80")}>
            <Icon name="settings" size={20} />المزيد
          </button>
        )}
      </nav>
    </>
  );
}
