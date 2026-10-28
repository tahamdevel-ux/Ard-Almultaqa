import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, logout } from "@/server/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { NavLinks } from "@/components/NavLinks";
import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/icons";

const NAV: { href: string; label: string; perm: Permission; icon: IconName }[] = [
  { href: "/dashboard", label: "الرئيسية", perm: "dashboard.view", icon: "home" },
  { href: "/pilgrims", label: "المعتمرون", perm: "pilgrims.view", icon: "users" },
  { href: "/trips", label: "الرحلات", perm: "trips.view", icon: "bus" },
  { href: "/hotels", label: "الفنادق", perm: "hotels.view", icon: "hotel" },
  { href: "/programs", label: "القوالب", perm: "trips.write", icon: "template" },
  { href: "/agents", label: "الوكلاء", perm: "agents.view", icon: "agent" },
  { href: "/import", label: "استيراد", perm: "import.run", icon: "upload" },
  { href: "/users", label: "المستخدمون", perm: "users.manage", icon: "shield" },
  { href: "/audit", label: "السجل", perm: "audit.view", icon: "clock" },
  { href: "/settings", label: "الإعدادات", perm: "settings.manage", icon: "settings" },
];

async function doLogout() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-brand-deeper text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0" aria-label="الرئيسية">
            <Logo size={40} />
            <span className="hidden text-sm font-bold leading-tight sm:block">أرض الملتقى<span className="block text-[11px] font-normal text-gold-bright">للحج والعمرة</span></span>
          </Link>
          <div className="min-w-0 flex-1"><NavLinks items={NAV.filter((n) => can(user.role, n.perm))} /></div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-left text-xs leading-tight md:block">{user.name}<span className="block text-white/60">{ROLE_LABELS[user.role]}</span></span>
            <form action={doLogout}><button className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-2 text-xs font-bold hover:bg-white/20" aria-label="تسجيل الخروج"><Icon name="logout" size={16} /><span className="hidden sm:inline">خروج</span></button></form>
          </div>
        </div>
        <div className="h-0.5 bg-gradient-to-l from-gold-bright via-gold to-transparent" />
      </header>
      <main className="mx-auto max-w-7xl p-4 pb-12">{children}</main>
    </div>
  );
}
