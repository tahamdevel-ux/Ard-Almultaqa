"use client";

/** Last resort (the layout itself failed): plain Arabic message instead of the framework's English one. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "sans-serif", background: "#f6f6f1", padding: 24, textAlign: "center" }}>
        <h1>تعذّر فتح الصفحة</h1>
        <p>حدث خطأ غير متوقع. جرّب مرة أخرى وإذا تكرر أخبر مدير النظام.</p>
        {error.digest && <p>رمز الخطأ: <code dir="ltr">{error.digest}</code></p>}
        <button onClick={() => reset()} style={{ padding: "8px 20px", fontSize: 16 }}>إعادة المحاولة</button> <a href="/dashboard">الصفحة الرئيسية</a>
      </body>
    </html>
  );
}
