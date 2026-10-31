# النشر الفعلي على Railway (جاهز للعمل)

كل `git push` على الفرع المختار ← بناء ونشر تلقائي. المشروع مُجهَّز: `Dockerfile` و`railway.json` و`deploy/start.sh`.
عند كل تشغيل: ترحيل القاعدة تلقائياً ← فحص الأسرار ← إنشاء أول مدير (إذا لا يوجد مستخدمون) ← تشغيل التطبيق.

## 1) إنشاء المشروع
1. railway.com ← سجّل بحساب GitHub، واشترك بخطة **Hobby** (الخطة المجانية رامها 0.5 GB وهذا لا يكفي لملفات PDF).
2. **New Project → Deploy from GitHub repo** ← اختر `Ard-Almultaqa` ← بعد الإنشاء: خدمة التطبيق → **Settings → Source → Branch** اختر الفرع (`main` بعد الدمج).
3. بنفس المشروع: **+ New → Database → Add PostgreSQL**.

## 2) المتغيرات (خدمة التطبيق → Variables)
| الاسم | القيمة | ملاحظة |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | اضغط Add Reference واختر من خدمة Postgres |
| `APP_SECRET` | نص عشوائي ≥ 32 حرفاً | **إجباري**؛ التطبيق يرفض الإقلاع بدونه |
| `ADMIN_USERNAME` | مثلاً `admin` | يُستخدم فقط إذا لا يوجد أي مستخدم |
| `ADMIN_PASSWORD` | ≥ 10 أحرف، قوية | **احذفه بعد أول دخول** |
| `STORAGE_DRIVER` | `db` | المرفقات (صور الجوازات) تُحفظ بقاعدة البيانات فتُنسخ معها |

لا تضف `SEED_DEMO` للاستخدام الفعلي (هو للتجربة ببيانات وهمية).
لتوليد `APP_SECRET`: `openssl rand -hex 32` (أو أي مولّد كلمات سر طويل).

## 3) التشغيل
1. **Settings → Networking → Generate Domain** (أو أضف دومينك: Custom Domain).
2. أول بناء ياخذ عدة دقائق (تنزيل Chromium لملفات PDF). تابع تبويب **Deployments** ← **View logs**: لازم يظهر
   `first admin '…' created` ثم `Ready`.
3. افتح الرابط وسجّل الدخول، ثم **احذف `ADMIN_PASSWORD`** من المتغيرات، وأضف بقية المستخدمين من شاشة «المستخدمون».
4. من شاشة «الإعدادات»: اسم الشركة وعنوانها وهواتفها (تظهر على الطباعة) وسعر الصرف المقترح.

## 4) البقاء شغّالاً
- فحص الصحة: `/api/health` (مضبوط بـ`railway.json`؛ يعيد التشغيل عند الفشل).
- أضف مراقبة خارجية على `https://دومينك/api/health` (انظر `docs/UPTIME.md`).
- راقب تبويب **Usage** أول شهر؛ الدفع حسب الاستهلاك (رام ≈10$/GB بالشهر، معالج ≈20$/vCPU).

## 5) النسخ الاحتياطي (مهم)
- لأن المرفقات داخل القاعدة، نسخة القاعدة = كل شيء. فعّل النسخ الاحتياطي من خدمة Postgres إذا توفر بخطتك، وإلا نفّذ دورياً من جهازك:
  `pg_dump "<DATABASE_URL العامة>" -Fc -f ard-$(date +%F).dump` وخزّنه بمكان آمن، وجرّب الاسترجاع مرة (`pg_restore`).

## 6) إصلاح الأعطال
| الرسالة بالسجل | السبب |
|---|---|
| `APP_SECRET must be set …` | أضف `APP_SECRET` (32 حرفاً فأكثر) |
| `Environment variable not found: DATABASE_URL` | أضف المرجع `${{Postgres.DATABASE_URL}}` للمتغير |
| انهيار عند طباعة PDF | الرام غير كافٍ؛ تأكد أنك على خطة Hobby وليس Free |
| `ADMIN_PASSWORD must be at least 10 characters` | كلمة سر أطول |
