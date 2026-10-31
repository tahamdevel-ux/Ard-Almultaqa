# النشر على Contabo مع تحديث تلقائي من GitHub

كل `git push` على الفرع المحدد ← GitHub Actions يدخل السيرفر بـSSH ← يسحب الكود ← يعيد بناء Docker.

## 1) شراء السيرفر
- **Cloud VPS 10** (حسب مصادر البحث: 4 معالج، 8 GB رام، 75 GB NVMe، حوالي 4.4–4.5€ بالشهر). تحقق من السعر النهائي عند الطلب.
- النظام: **Ubuntu 24.04**. الموقع: الأقرب (ألمانيا/أوروبا).
- رسوم التأسيس (Setup fee): بحسب صفحة دعم Contabo تُطبَّق على بعض عقود الشهر والستة أشهر للخطة الصغيرة؛ اختر **12 شهراً** أو راجع الفاتورة قبل الدفع.

## 2) تجهيز السيرفر (مرة واحدة)
ادخل `ssh root@IP` وشغّل:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/tahamdevel-ux/Ard-Almultaqa/claude/new-session-amlm6y/deploy/install.sh) <رابط-المستودع> <الدومين>
```
(الدومين يجب أن يشير للـIP قبل التشغيل، سجل A. إذا المستودع خاص: ولّد مفتاح للسيرفر `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""` وأضف `~/.ssh/id_ed25519.pub` في GitHub → Settings → Deploy keys (قراءة فقط) واستخدم رابط SSH `git@github.com:tahamdevel-ux/Ard-Almultaqa.git`.)

## 3) مفتاح النشر التلقائي (مفتاح مخصص لـGitHub Actions)
على جهازك:
```bash
ssh-keygen -t ed25519 -f ard_deploy -N "" -C "github-actions"
ssh-copy-id -i ard_deploy.pub root@IP        # يضيف المفتاح العام للسيرفر
```
ثم في GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| الاسم | القيمة |
|---|---|
| `DEPLOY_HOST` | IP السيرفر |
| `DEPLOY_USER` | `root` (أو مستخدم ضمن مجموعة docker) |
| `DEPLOY_SSH_KEY` | محتوى الملف **ard_deploy** (المفتاح الخاص كاملاً) |
| `DEPLOY_URL` (اختياري) | `https://الدومين` لفحص الصحة بعد النشر |

احذف الملف `ard_deploy` من جهازك بعد النسخ، ولا ترفعه على GitHub.

## 4) التجربة
اعمل أي commit على الفرع ← تبويب **Actions** بالمستودع يعرض تشغيل `deploy` ← بعد دقائق التعديل على الموقع.
تشغيل يدوي على السيرفر: `bash /opt/ard-almultaqa/deploy/update.sh <الفرع>`.

## ملاحظات
- الفروع المراقبة مكتوبة بـ`.github/workflows/deploy.yml` (`main` والفرع الحالي).
- كل نشر يعيد بناء الصورة (3–10 دقائق) ويحدث توقف قصير أثناء إعادة التشغيل.
- لا تفتح منفذ Postgres للإنترنت (compose لا ينشره). الجدار الناري (ufw) يُضبط من `install.sh`.
- أبقِ نسخة من `/opt/ard-almultaqa/.env` خارج السيرفر (فيه `BACKUP_PASSPHRASE`).
