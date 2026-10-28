import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { login, SESSION_COOKIE } from "@/server/auth";
import { Logo } from "@/components/Logo";

async function doLogin(_: unknown, form: FormData) {
  "use server";
  const r = await login(String(form.get("username") ?? "").trim(), String(form.get("password") ?? ""), String(form.get("otp") ?? "") || undefined);
  if (!r.ok) return redirect(`/login?error=${encodeURIComponent(r.error)}`);
  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600,
  });
  redirect("/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-brand-deeper px-6 py-10 text-center text-white">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
        <Logo size={170} className="relative drop-shadow-xl" />
        <h1 className="relative mt-5 text-2xl font-bold">نظام إدارة المعتمرين والرحلات</h1>
        <p className="relative mt-2 max-w-sm text-sm text-white/70">كل معتمر يُسجَّل مرة واحدة، ومنه تُستخرج كشوف الباصات وقوائم الطيران والتسكين.</p>
        <div className="relative mt-6 h-0.5 w-24 bg-gradient-to-l from-transparent via-gold-bright to-transparent" />
      </section>
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <h2 className="page-title">تسجيل الدخول</h2>
          <p className="mb-5 mt-1 text-sm text-brand-mid">أدخل بيانات حسابك للمتابعة</p>
          {error && <p role="alert" className="alert-bad mb-4">{error}</p>}
          <form action={doLogin.bind(null, null)} className="space-y-4">
            <div><label className="label" htmlFor="username">اسم المستخدم</label>
              <input id="username" name="username" className="input" dir="ltr" autoComplete="username" required /></div>
            <div><label className="label" htmlFor="password">كلمة المرور</label>
              <input id="password" name="password" type="password" className="input" dir="ltr" autoComplete="current-password" required /></div>
            <div><label className="label" htmlFor="otp">رمز التحقق (إن كان مفعّلاً)</label>
              <input id="otp" name="otp" className="input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" /></div>
            <button className="btn-gold w-full py-2.5">دخول</button>
          </form>
        </div>
      </section>
    </main>
  );
}
