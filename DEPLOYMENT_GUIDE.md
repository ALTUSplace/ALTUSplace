# دليل إطلاق ونشر منصة ALTUSplace على الإنترنت (Deployment & Launch Guide)

يسرنا تقديم الدليل الشامل والخطوات التطبيقية السهلة لنشر وتثبيت منصة **ALTUSplace** (الوساطة المزدوجة للسيارات والعقارات في المغرب) على الإنترنت بشكل حقيقي ومجاني أو عبر استضافات سحابية كبرى مثل Vercel، Netlify، أو Manus Autoscale مع ربط قاعدة بيانات مخصصة (Supabase / TiDB).

---

## 1. المتطلبات الأساسية (Prerequisites)
- حساب على [GitHub](https://github.com) لرفع كود المشروع.
- حساب على منصة النشر السحابي المفضلة لديك ([Vercel](https://vercel.com) أو [Netlify](https://netlify.com)) أو الاعتماد على استضافتكم المدمجة في منصة المناموس (Autoscale).
- قاعدة بيانات متوافقة مع MySQL / PostgreSQL (مثل Supabase أو PlanetScale أو TiDB).

---

## 2. خطوات النشر خطوة بخطوة (Step-by-Step Deployment)

### الخطوة الأولى: رفع الكود إلى مستودع GitHub
1. قم بفتح مستودع المشروع أو تصدير الكود عبر خيار (Export to GitHub) من لوحة التحكم.
2. تأكد من أن الملفات الأساسية موجودة في الجذر (Root):
   - `package.json`
   - `drizzle.schema.ts`
   - `server/` و `client/`

### الخطوة الثانية: ربط قاعدة البيانات (Database Setup)
1. قم بإنشاء مشروع جديد على **Supabase** أو **PlanetScale**.
2. انسخ رابط الاتصال بقاعدة البيانات (Connection URL).
3. أضف متغير البيئة التالي في لوحة تحكم الاستضافة السحابية:
   - `DATABASE_URL=mysql://user:password@host:port/database`

### الخطوة الثالثة: النشر على Vercel أو Netlify
1. قم بتسجيل الدخول إلى **Vercel** واضغط على **New Project**.
2. استورد مستودع GitHub الخاص بمنصة ALTUSplace.
3. إعدادات البناء (Build Settings):
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist`
   - **Install Command:** `pnpm install`
4. أضف متغيرات البيئة المطلوبة (Environment Variables):
   - `JWT_SECRET=your_secure_random_jwt_secret`
   - `DATABASE_URL=your_production_database_url`
5. اضغط على **Deploy** وانتظر دقيقة واحدة حتى يتم بناء الموقع وإطلاقه بنجاح!

---

## 3. ربط النطاق المخصص (Custom Domain)
1. من لوحة تحكم الاستضافة (Vercel / Netlify / Manus Management UI)، توجه إلى قسم **Domains**.
2. أضف نطاقك التجاري (مثل `ALTUSplace.ma`).
3. قم بتعديل سجلات DNS لدى مسجل النطاق الخاص بك (مثل GoDaddy أو Maroc Telecom) بربط سجلات CNAME و A وتوجيهها نحو خوادم الاستضافة.
4. تفعيل شهادة الحماية SSL يتم بشكل تلقائي ومجاني بالكامل.

---
*تم إعداد هذا الدليل لضمان إطلاق تجاري سلس وناجح لمنصة ALTUSplace في بالسوق المغربي.*
