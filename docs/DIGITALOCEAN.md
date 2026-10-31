# النشر التلقائي على DigitalOcean App Platform

كل `git push` على الفرع المحدد = بناء ونشر تلقائي (Docker) مع قاعدة PostgreSQL مُدارة.

## الخطوات (مرة واحدة)
1. DigitalOcean → **Create → Apps** → اختر **GitHub** وامنح DigitalOcean صلاحية الوصول للمستودع `Ard-Almultaqa`.
2. اختر الفرع `claude/new-session-amlm6y` (أو `main` بعد الدمج) وفعّل **Autodeploy**. سيكتشف `Dockerfile` تلقائياً.
   - أسهل طريقة: في صفحة المراجعة اضغط **Edit your app spec** والصق محتوى `.do/app.yaml` (بعد تغيير `APP_SECRET` و`SEED_ADMIN_PASSWORD`).
3. أضف قاعدة بيانات **PostgreSQL 16** (Dev Database للتجربة، أو Managed Database للاستخدام الفعلي) واربطها باسم `db`.
4. **Region:** Frankfurt. **حجم الحاوية:** 2 GB رام على الأقل (ملفات PDF تشغّل متصفح Chromium).
5. المتغيرات (Environment Variables) بالمكوّن `web`:

| الاسم | القيمة |
|---|---|
| `DATABASE_URL` | `${db.DATABASE_URL}` |
| `APP_SECRET` | نص عشوائي طويل (Encrypt) |
| `STORAGE_DIR`/`STORAGE_DRIVER` | `STORAGE_DRIVER=db` (لا يوجد قرص دائم، فالمرفقات تُحفظ بالقاعدة) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | أول مدير (كلمة السر ≥ 10 أحرف، Encrypt)؛ احذف `ADMIN_PASSWORD` بعد أول دخول |
| `SEED_DEMO` | **لا تضفه للإنتاج** (بيانات وهمية للتجربة فقط) |

6. **Create Resources.** أول بناء ياخذ 10–15 دقيقة (تنزيل Chromium).
7. الرابط يظهر بالأعلى: `https://<app>.ondigitalocean.app` (يمكن ربط دومين من تبويب Settings → Domains، والشهادة تلقائية).

## للاستخدام الفعلي (بيانات حقيقية)
- احذف `SEED_DEMO`. أنشئ أول مدير من تبويب **Console** للمكوّن:
  `npx tsx prisma/create-admin.ts <user> <password> "مدير النظام"`
- حوّل القاعدة إلى **Managed Database** (production) للنسخ الاحتياطي اليومي.
- ملفات المستمسكات داخل القاعدة؛ إذا كثرت (آلاف الصور) فكّر بنقلها إلى DigitalOcean Spaces.
