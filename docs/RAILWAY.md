# النشر على Railway (للمبتدئين: بدون أوامر سيرفر)

Railway يربط مستودع GitHub مباشرة: كل `git push` على الفرع المختار = بناء ونشر تلقائي. قاعدة PostgreSQL تُضاف بنقرة.
التكلفة حسب الاستهلاك الفعلي (راجع صفحة أسعارهم؛ خطة Hobby 5$ بالشهر تشمل رصيد استهلاك 5$).

## الخطوات
1. أنشئ حساباً على railway.com بحساب GitHub.
2. **New Project → Deploy from GitHub repo** → اختر `Ard-Almultaqa` وامنحه الصلاحية. اختر الفرع من إعدادات الخدمة (Settings → Source → Branch).
   سيكتشف `Dockerfile` و`railway.json` تلقائياً.
3. بنفس المشروع: **+ New → Database → Add PostgreSQL**.
4. افتح خدمة التطبيق → **Variables** وأضف:

| الاسم | القيمة |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Add Reference: اختر من قائمة خدمة Postgres) |
| `APP_SECRET` | نص عشوائي طويل |
| `STORAGE_DRIVER` | `db` (يحفظ المرفقات بالقاعدة؛ أو أضف Volume وأبقِ الافتراضي مع `STORAGE_DIR=/data/storage`) |
| `SEED_DEMO` | `1` للتجربة فقط (بيانات وهمية) |
| `SEED_ADMIN_PASSWORD` | كلمة سر قوية لمستخدمي التجربة |

5. **Settings → Networking → Generate Domain** يعطيك رابطاً `https://…up.railway.app` (ويمكن ربط دومينك).
6. أول بناء ياخذ بضع دقائق (تنزيل Chromium). بعدها كل push ينشر تلقائياً.

## للاستخدام الفعلي
- احذف `SEED_DEMO`، وأنشئ أول مدير: خدمة التطبيق → ⋯ → **Run command / Shell**:
  `npx tsx prisma/create-admin.ts <user> <password> "مدير النظام"`
- فعّل النسخ الاحتياطي لقاعدة Postgres (من إعدادات الخدمة إن توفر بخطتك) أو صدّر نسخة دورياً.
- راقب الاستهلاك بتبويب Usage؛ طباعة PDF ترفع الرام لحظياً.
