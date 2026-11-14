"use client";
import Link from "next/link";

/** A page that throws shows this instead of a blank «Application error»: the menu stays, the person can retry or go back. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-xl space-y-4 rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-bold text-red-800">تعذّر فتح هذه الصفحة</h1>
      <p className="text-brand-mid">حدث خطأ غير متوقع. لم يُحفظ أو يُحذف شيء بسببه. جرّب مرة أخرى، وإذا تكرر أخبر مدير النظام وأعطه الرمز أدناه.</p>
      {error.digest && <p className="text-sm">رمز الخطأ: <span dir="ltr" className="rounded bg-canvas px-2 py-0.5 font-mono">{error.digest}</span></p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn" onClick={() => reset()}>إعادة المحاولة</button>
        <Link href="/dashboard" className="btn-secondary">الصفحة الرئيسية</Link>
      </div>
    </div>
  );
}
