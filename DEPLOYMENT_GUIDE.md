# دليل إطلاق ونشر منصة ALTUSplace على الإنترنت (Deployment & Launch Guide)

يسرنا تقديم الدليل الشامل والخطوات التطبيقية السهلة لنشر وتثبيت منصة **ALTUSplace** (الوساطة المزدوجة للسيارات والعقارات في المغرب) على الإنترنت بشكل حقيقي ومجاني أو عبر استضافات سحابية كبرى مثل Vercel، Netlify، أو Manus Autoscale مع ربط قاعدة بيانات مخصصة (Supabase / TiDB).

---

## 1. المتطلبات الأساسية (Prerequisites)
- حساب على [GitHub](https://github.com) لرفع كود المشروع.
- حساب على منصة النشر السحابي المفضلة لديك ([Vercel](https://vercel.com) أو [Netlify](https://netlify.com)) أو الاعتماد على استضافتكم المدمجة في منصة المناموس (Autoscale).
- قاعدة بيانات متوافقة مع PostgreSQL (مثل Supabase أو TiDB).

---

## 2. خطوات النشر خطوة بخطوة (Step-by-Step Deployment)

### الخطوة الأولى: رفع الكود إلى مستودع GitHub
1. قم بفتح مستودع المشروع أو تصدير الكود عبر خيار (Export to GitHub) من لوحة التحكم.
2. تأكد من أن الملفات الأساسية موجودة في الجذر (Root):
   - `package.json`
   - `drizzle/schema.ts` (PostgreSQL schema + `drizzle/` migrations)
   - `server/` و `client/`

### الخطوة الثانية: ربط قاعدة البيانات (Database Setup)
1. قم بإنشاء مشروع جديد على **Supabase** (PostgreSQL) أو أي قاعدة PostgreSQL سحابية.
2. انسخ رابط الاتصال بقاعدة البيانات (Connection URL) — يُفضّل Transaction Pooler.
3. أضف متغير البيئة التالي في بيئة تشغيل الـ Node backend (وليس Vercel):
   - `DATABASE_URL=postgresql://postgres.<project>:<password>@aws-<region>.pooler.supabase.com:6543/postgres`
4. بعد ضبط `DATABASE_URL`، طبّق ترحيلات المخطط (مigrations) على قاعدة البيانات الحيّة:
   - `pnpm db:migrate`  (يطبّق الفروع المعلّقة حالياً: `0007` حقول الطيران + `0008` تسعير العقارات الشهري)

### الخطوة الثالثة: النشر على Vercel (SPA + واجهة API معاً)
1. قم بتسجيل الدخول إلى **Vercel** واضغط على **New Project**.
2. استورد مستودع GitHub الخاص بمنصة ALTUSplace.
3. إعدادات البناء (Build Settings) — مطابقة لملف `vercel.json`:
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist/public`
   - **Install Command:** `pnpm install`
4. المعمارية: نفس مشروع Vercel يستضيف الواجهة الثابتة (`dist/public`) **وتشغّل دالة Serverless واحدة (`api/index.js`) تُعاد إليها كل طلبات `/api/*` عبر `rewrites` في `vercel.json`، ثم يقوم خادم Express المدمج بالتوجيه الداخلي** — أي أن tRPC والـ OAuth والـ webhooks تعمل على نفس نطاق Vercel دون حاجة إلى `VITE_API_URL`. (ملاحظة: Vercel لا يدعم ملفات catch-all مثل `api/[[...path]].js` خارج Next.js، لذلك نستخدم ملفاً واحداً + rewrite.)
5. أضف متغيرات بيئة وقت التشغيل (Runtime) في Vercel → Settings → Environment Variables:
   - `DATABASE_URL` (رابط Supabase Transaction Pooler)
   - `JWT_SECRET` (مفتاح توقيع الجلسات — ≥ 32 بايت)
   - `OAUTH_SERVER_URL` (بوابة الدخول الخارجية)
   - `DIRECT_LOGIN_PASSWORD` (اختياري — دخول المالك المباشر بديل عند غياب بوابة OAuth).
     عند ضبطه تُفعَّل صفحة `/direct-login` ونقطة `POST /api/auth/direct-login`،
     ويُسجَّل حساب المالك دائماً بدور **SUPER_ADMIN**. اتركه فارغاً لتعطيله (404).
     **بدون أي ضبط مسبق:** افتح `/direct-login` مرة واحدة لضبط كلمة مرور المالك،
     فتُخزَّن كـ scrypt hash في قاعدة البيانات (`platform_settings.owner_password_hash`)
     ولا يوجد أي سرّ داخل المستودع. الإعداد متاح مرة واحدة فقط؛ بعده يصبح تسجيل الدخول فقط.
     كما يُولَّد مفتاح توقيع الجلسات تلقائياً ويُخزَّن في `platform_settings.session_secret`
     عند غياب `JWT_SECRET`. استخدم كلمة مرور طويلة عشوائية، وألغِ تفعيله بعد استعادة بوابة OAuth.
   - `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` (تنبيهات الوكلاء الفورية)
   - `OWNER_OPEN_ID` + `SUPER_ADMIN_OPEN_IDS` (حسابات الإدارة العليا)
6. أضف متغيرات بناء الواجهة (Build-time) في Vercel:
   - `VITE_APP_URL=your_frontend_url`
   - `VITE_APP_ID` + `VITE_OAUTH_PORTAL_URL` (لتفعيل زر الدخول عبر OAuth — اختيارية إذا كنت تستخدم `DIRECT_LOGIN_PASSWORD`)

### الخطوة الرابعة: متغيرات WhatsApp (تنبيهات الوكلاء الفورية)
على استضافة الـ Node backend، أضف ما يلي لتفعيل رسائل WhatsApp الفورية عند كل حجز جديد:
- `WHATSAPP_ACCESS_TOKEN=` (من Meta Business Cloud API)
- `WHATSAPP_PHONE_NUMBER_ID=`
- `WHATSAPP_API_VERSION=v20.0` (اختياري — له قيمة افتراضية)
بمجرّد تفعيلها، تُرسل رسالة نصية فورية إلى رقم الوكيل (`users.whatsappPhone` / `agencyPhone`) عند تسجيل حجز جديد؛ وإن تُركت فارغة يتخطّى النظام الرسالة بأمان دون تعطيل الحجز.

---

## 3. ربط النطاق المخصص (Custom Domain)
1. من لوحة تحكم الاستضافة (Vercel / Netlify / Manus Management UI)، توجه إلى قسم **Domains**.
2. أضف نطاقك التجاري (مثل `ALTUSplace.ma`).
3. قم بتعديل سجلات DNS لدى مسجل النطاق الخاص بك (مثل GoDaddy أو Maroc Telecom) بربط سجلات CNAME و A وتوجيهها نحو خوادم الاستضافة.
4. تفعيل شهادة الحماية SSL يتم بشكل تلقائي ومجاني بالكامل.

---

## 4. قواعد أمان الإنتاج (Production Security Guards)

يُطبَّق فحصان تلقائيان عند تشغيل الخادم في **بيئة الإنتاج فقط** (`NODE_ENV=production`):

1. **`JWT_SECRET` إلزامي وبطول ≥ 32 حرفاً:** إذا كان `JWT_SECRET` مفقوداً أو أقصر من 32 حرفاً، **يرفض الخادم الإقلاع فوراً** (خطأ FATAL). تأكد من ضبط `JWT_SECRET` طويل وعشوائي (≥ 32 بايت) في Vercel قبل أي نشر قادم، وإلا فستفشل كل الوظائف ولن يبدأ التطبيق.
2. **`DIRECT_LOGIN_PASSWORD` يُسجّل تحذيراً في الإنتاج:** عند ضبطه في بيئة الإنتاج يُسجَّل تحذير أمني `SECURITY: direct-login backdoor enabled in production` ثم يستمر الإقلاع. يُنصح بشدة بأن يكون **فارغاً** في الإنتاج لتعطيل `POST /api/auth/direct-login` و `/direct-login` (الاستجابة 404).

### قائمة السماح لمزامنة iCal (اختياري)
- `ICAL_ALLOWED_HOSTS` — قائمة مضيفات مفصولة بفواصل (`airbnb.com,booking.com` مثال) تحدّد مزامنة تقويم iCal على هذه المضيفات فقط (المضيف نفسه أو نطاقاته الفرعية). إن تُركت غير مضبوطة يُسمح بأي مضيف HTTPS عام — مع رفض العناوين الخاصة/الداخلية تلقائياً.

### حماية SSRF لمزامنة iCal
كل رابط iCal يخضع للفحص قبل الجلب: **HTTPS فقط**، وتحليل اسم المضيف عبر DNS، ورفض الشبكات الخاصة/المحجوزة (`127.0.0.0/8`، `10.0.0.0/8`، `172.16.0.0/12`، `192.168.0.0/16`، `169.254.0.0/16`، `0.0.0.0`، `::1`، `fc00::/7` و `localhost`)، مع مهلة **5 ثوانٍ** وحد أقصى لحجم الاستجابة **1 ميغابايت**. أي رابط يشير إلى عنوان داخلي يُرفض برسالة واضحة بالعربية والفرنسية تُسجَّل في `icalSyncError`.

---
*تم إعداد هذا الدليل لضمان إطلاق تجاري سلس وناجح لمنصة ALTUSplace في بالسوق المغربي.*
