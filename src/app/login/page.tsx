import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { login, SESSION_COOKIE } from "@/server/auth";

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
    <main className="mx-auto mt-16 max-w-sm px-4">
      <div className="card">
        <h1 className="mb-1 text-xl font-bold text-brand">أرض الملتقى للحج والعمرة</h1>
        <p className="mb-4 text-sm text-gray-600">تسجيل الدخول إلى نظام إدارة المعتمرين</p>
        {error && <p role="alert" className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        <form action={doLogin.bind(null, null)} className="space-y-3">
          <div><label className="label" htmlFor="username">اسم المستخدم</label>
            <input id="username" name="username" className="input" dir="ltr" autoComplete="username" required /></div>
          <div><label className="label" htmlFor="password">كلمة المرور</label>
            <input id="password" name="password" type="password" className="input" dir="ltr" autoComplete="current-password" required /></div>
          <div><label className="label" htmlFor="otp">رمز التحقق (إن كان مفعّلاً)</label>
            <input id="otp" name="otp" className="input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" /></div>
          <button className="btn w-full">دخول</button>
        </form>
      </div>
    </main>
  );
}
