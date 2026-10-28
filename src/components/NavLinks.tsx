"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export function NavLinks({ items }: { items: { href: string; label: string; icon: IconName }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto whitespace-nowrap text-sm" aria-label="القائمة الرئيسية">
      {items.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={"flex items-center gap-1.5 rounded-lg px-2.5 py-2 font-bold transition-colors " + (active ? "bg-white/15 text-gold-bright" : "text-white/80 hover:bg-white/10 hover:text-white")}>
            <Icon name={n.icon} size={16} />{n.label}
          </Link>
        );
      })}
    </nav>
  );
}
