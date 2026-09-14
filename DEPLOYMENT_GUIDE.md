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

### الخطوة الثالثة: النشر على Vercel (الواجهة الثابتة)
1. قم بتسجيل الدخول إلى **Vercel** واضغط على **New Project**.
2. استورد مستودع GitHub الخاص بمنصة ALTUSplace.
3. إعدادات البناء (Build Settings) — مطابقة لملف `vercel.json`:
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist/public`
   - **Install Command:** `pnpm install`
4. أضف متغيرات البيئة المطلوبة للواجهة (Build-time على Vercel):
   - `VITE_APP_URL=your_frontend_url`
   - `VITE_API_URL` (عند فصل الواجهة عن الـ backend: رابط tRPC الخلفي)
5. المعمارية: Vercel يستضيف SPA ثابتة فقط، بينما خادم Node (`npm start` من `server/_core/index.ts`) يشغّل tRPC، المدفوعات، WhatsApp اورالرسائل على استضافة منفصلة مع `DATABASE_URL`.

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
*تم إعداد هذا الدليل لضمان إطلاق تجاري سلس وناجح لمنصة ALTUSplace في بالسوق المغربي.*
