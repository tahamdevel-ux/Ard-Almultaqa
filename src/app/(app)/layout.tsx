import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, logout } from "@/server/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/dashboard", label: "الرئيسية", perm: "dashboard.view" },
  { href: "/pilgrims", label: "المعتمرون", perm: "pilgrims.view" },
  { href: "/trips", label: "الرحلات", perm: "trips.view" },
  { href: "/agents", label: "الوكلاء", perm: "agents.view" },
  { href: "/import", label: "استيراد Excel", perm: "import.run" },
  { href: "/users", label: "المستخدمون", perm: "users.manage" },
  { href: "/audit", label: "سجل التعديلات", perm: "audit.view" },
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
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="font-bold">أرض الملتقى</span>
          <nav className="flex flex-1 flex-wrap gap-x-3 text-sm">
            {NAV.filter((n) => can(user.role, n.perm)).map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-2 py-1 hover:bg-brand-dark">{n.label}</Link>
            ))}
          </nav>
          <span className="text-xs">{user.name} ({ROLE_LABELS[user.role]})</span>
          <form action={doLogout}><button className="rounded bg-brand-dark px-2 py-1 text-xs">خروج</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
