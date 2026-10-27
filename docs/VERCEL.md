# معاينة مؤقتة على Vercel (ببيانات تجريبية فقط)

> للمعاينة فقط. **لا تضع جوازات أو بيانات حقيقية عليها.** الإنتاج يكون على VPS (انظر README).

## 1) قاعدة بيانات (Neon، مجانية)
1. أنشئ مشروعاً على neon.tech (اختر أقرب منطقة، مثلاً Frankfurt).
2. انسخ **connection string** وأضف في آخرها: `?sslmode=require&connection_limit=1`
   (استخدم الرابط المباشر وليس رابط `-pooler`، لأن الترحيل `prisma migrate` لا يعمل جيداً عبر الـpooler).

## 2) المشروع على Vercel
1. Vercel → Add New → Project → اختر مستودع GitHub `ard-almultaqa` (امنح Vercel صلاحية الوصول إليه).
2. **Branch:** الفرع `claude/new-session-amlm6y` (أو `main` بعد الدمج). *Production Branch* في Settings → Git.
3. **Framework:** Next.js (يُكتشف تلقائياً). **Build Command** يُستخدم تلقائياً من `vercel-build` في package.json.
4. **Environment Variables** (Production + Preview):

| الاسم | القيمة |
|---|---|
| `DATABASE_URL` | رابط Neon من الخطوة 1 |
| `APP_SECRET` | نص عشوائي طويل (32+ حرف) |
| `SEED_DEMO` | `1` (يملأ بيانات تجريبية عند أول بناء؛ آمن للتكرار) |
| `SEED_ADMIN_PASSWORD` | كلمة سر **قوية** لكل مستخدمي التجربة (admin, reg, housing, acc, sup) |

5. Deploy. أول بناء يرحّل القاعدة ويعبّئها ثم يبني التطبيق (دقيقتان تقريباً).

## ما يعمل وما يختلف
- الصور المرفوعة تُحفظ داخل قاعدة البيانات (`STORAGE_DRIVER=db` تلقائياً على Vercel).
- ملفات PDF تعمل عبر Chromium مصغّر (`@sparticuz/chromium`)؛ أول طلب بعد خمول يكون أبطأ (بضع ثوانٍ).
- **حد حجم الرفع على Vercel 4.5 ميغابايت** لكل طلب، لذا الصور الكبيرة من الموبايل قد تُرفض هنا (على الـVPS الحد 12 ميغابايت).
- النسخ الاحتياطي: يعتمد على Neon، وليس على سكربتات النظام.
- إذا غيّرت `SEED_ADMIN_PASSWORD` لاحقاً لن تتغير كلمات سر المستخدمين الموجودين؛ غيّرها من شاشة المستخدمين.

## الحذف
احذف مشروع Vercel وقاعدة Neon عند الانتهاء من المعاينة.
