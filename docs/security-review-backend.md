# 🔒 تقرير أمني — طبقة الـ Backend/API (tRPC + Express + Supabase RLS)

> **النوع:** تحليل أمني (read-only) — Task C
> **النطاق:** `server/routers.ts` (~3900 سطر، 111 procedure)، `server/_core/*` (trpc, security, context, sdk, env, sessionSecret, app, storageProxy, oauth, directAuth, ownerAuth, renterAuth, partnerAuth, partnerApplication, voiceTranscription)، `server/{db,storage,ical,leaseReminder,security/urlGuard,payments/webhooks,verification/webhook,middleware/cronAuth}`، `supabase/rls.sql`، `drizzle/schema.ts`، وبيئة الـ client.
> **الخلاصة:** **0 Critical** · **3 High** · **7 Medium** · **10 Low**.
> القاعدة الأمنية صلبة بزاف (CSRF، CSP، headers، scrypt، timing-safe، SSRF guard، webhooks مُوقّعة). المشاكل الأساسية مركّزة في: **RLS شبه غائبة**، و**ثغرة الاستيلاء على حساب المالك في أول تشغيل**، و**عدم وجود حدود (limits) على استعلامات عامة**.

---

## 🔴 High

### H-1 — RLS غائبة على 18 من 26 جدول، منها جداول تحمل أسرارًا
`supabase/rls.sql` كتفعّل RLS على **8 جداول فقط**: `users, listings, bookings, payments, invoices, kyc_submissions, escrow_ledger, notifications`. الباقي (18) بلا أي policy، ومنهم الحسّاسين:
- `platform_settings` → كتحمل `sessionSecret` (مفتاح توقيع الجلسات)، `ownerPasswordHash`, `ownerPasswordSalt` (`drizzle/schema.ts:482`).
- `partner_applications` → كتحمل `passwordHash` + `salt` (scrypt) مباشرة على الصف (`drizzle/schema.ts:117`).
- تانيت: `transactions, payout_requests, disputes, dispute_attachments, support_tickets, refund_requests, audit_logs, booking_messages, listing_comments, reviews, favorites, translations, commission_tiers, booking_vouchers, commercial_lease_contracts, listing_analytics_events`.

**الخطر:** أي وصول مباشر بمفتاح `anon` (مثلاً إذا تفعّل `VITE_SUPABASE_ANON_KEY`) يقدر يقرا هاد الجداول. زيادة على ذلك، ما كاينش أي migration في `drizzle/` كيفعّل RLS — الملف اليدوي فقط (drift risk).

### H-2 — اتصال التطبيق نفسه كيتجاوز RLS (بلا `FORCE ROW LEVEL SECURITY`)
`server/db.ts` كيتصل عبر `drizzle-orm/postgres-js` بـ `DATABASE_URL` = الصف المَجْمُوع `postgres.<ref>` ديال Supabase، وهو role كيتجاوز RLS. حتى الـ policies داخلة على claim `app_user_id` من `request.jwt.claims` (`rls.sql:30-38`) اللي **التطبيق ما كيصدرهش أبدًا** (الجلسات هي HS256 ديال التطبيق). المعنى: **RLS غير مُطبّقة على مسار الاتصال الحقيقي**، والعزل الوحيد هو التطبيق (`ownerProcedure` + `eq(listings.ownerId, ctx.user.id)`).

**الخطر:** خطأ واحد فـ router جديد (نسيان `eq(ownerId, ...)`) = تسريب بيانات بين المستأجرين بلا أي شبكة أمان فـ DB.
**توصية:** `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + role تطبيقي غير superuser مع `SET app.current_user_id`، ولا قبول صريح موثّق.

### H-3 — الاستيلاء على حساب المالك (SUPER_ADMIN) في أول تشغيل
`POST /api/auth/owner-setup` (`server/_core/directAuth.ts:102`) كان:
```
if (await isOwnerConfigured()) → 403
// ما بقاش → claimOwnerPassword() ثم issueOwnerSession() → role: "SUPER_ADMIN"
```
عام، غير مُصادَق. إذا نشر إنتاجي بلا `DIRECT_LOGIN_PASSWORD` وبلا كلمة سر مالك مُclaimed → **أول من كيصيفط الطلب كيولّي SUPER_ADMIN** وكتُعطى له كوكي جلسة سنة كاملة. الـ `/api/auth/` عندها strict limiter (5/min) و`claimOwnerPassword` فيها advisory lock، لكن هادو كيحدّو من الـ brute force فقط، ماشي من السباق.

> ✅ **تم الإصلاح** (Fix 1) — شوف قسم «حالة الإصلاحات» أسفله.

---

## 🟠 Medium

### M-1 — role `partner` ذاتي التسجيل كيحمل صلاحيات `ownerProcedure`
`partnerAuth.ts` كتسجّل role = `partner` بلا مصادقة إدارية، و`ownerProcedure` (`trpc.ts`) كتقبل `['owner','admin','partner','SUPER_ADMIN']`. النتيجة: أي شخص كيسجّل شريك كيقدر `listings.create` + رفع صور + `bookings.ownerList` (بيانات الرينترز) + `agency.settings` + `translation.*`. النشر النهائي كيمر من moderation (Pending → admin)، لكن السطح اتوسّع بلا vetting.

> ✅ **تم الإصلاح** (Fix 4) — شوف قسم «حالة الإصلاحات» أسفله.

### M-2 — `DIRECT_LOGIN_PASSWORD` كيبقى بابًا خلفيًا + بديل لمفتاح الجلسة
`env.ts:8` : `cookieSecret = JWT_SECRET ?? DIRECT_LOGIN_PASSWORD ?? ""`، و`DIRECT_LOGIN_PASSWORD` كيشغّل `/api/auth/direct-login` إلى الأبد. الإقلاع كيتحقق من طول `JWT_SECRET` فقط، ماشي من عدم استخدام كلمة سر ثابتة كمفتاح جلسة.

### M-3 — `listings.search` و `listings.list` بلا `.limit()`
`routers.ts:1938` (search) و`:1807` (list) كيجيبو **كل صفوف الجدول** للذاكرة ثم التصفيح/الفلترة فـ JS. العام/غير مُصادَق → استهلاك ذاكرة/CPU وDoS مع نمو الكتالوج. `pageSize` (max 200) ما كيأثرش على الاستعلام.

> ✅ **تم الإصلاح** (Fix 2) — شوف قسم «حالة الإصلاحات» أسفله.

### M-4 — Rate limiter في الذاكرة (in-memory `Map`)
`security.ts:7` — `buckets = new Map()`. على serverless/عدة instances، كل نسخة عندها budget خاص، وcold start كيرجّع العداد. معنى الحماية من الـ brute force على `strict-auth` (5/min) و`strict-payment` هي "best effort" فقط. يُنصح بـ Redis/Upstash أو rate limiting على الـ edge.

### M-5 — `/storage/*` خارج `/api/` → بلا rate limiting
`app.ts` + `storageProxy.ts:66` — القاعدة `app.use("/api/", apiRateLimit)` ما كتشملش `/storage/*`. كل طلب كيولّد `createSignedUrl` عند Supabase → cost/DoS خفيف.

### M-6 — أسطح spam عامة كتصيفط notifications/emails (bucket `standard` = 300/min فقط)
- `requestListing.create` (`:3460`, public) — فيه idempotency على `requestId`+`phone` و`dedupeKey: lead:${phone}`، لكن تدوير الأرقام كيولّي spam للـ admins.
- `supportTickets.create` (`:1714`) — كيوصّل لكل الأدمنز.
- `comments.create` / `reviews.create` — `reviews.create` مقيّد بحجز مكتمل، `comments.create` لا.
- `listings.trackEvent` (`:1991`) — public mutation كيكتب صفوف analytics.

### M-7 — رقم الواتساب الخاص (إشعارات الحجز) مكشوف عمومًا
`listings.getById` (`:2014-2026`) و`search`/`list` كيرجّعو `whatsappPhone` + `whatsappNumber` + `agencyPhone` بلا مصادقة، و`Checkout.tsx:209` كتفضّل `whatsappPhone` (رقم الإشعارات الخاص) على `whatsappNumber` (العمومي). هذا كيناقض سياسة "الرقم ما كيتكشفش حتى التأكيد" المتبعة فـ `bookings.getById`.

> ✅ **تم الإصلاح** (Fix 3) — شوف قسم «حالة الإصلاحات» أسفله. ملاحظة: `list`/`search` أصلًا ما كانوش كيرجّعو أي هاتف (غير `ownerName`/`ownerRole`) — الكشف كان فـ `getById` فقط.

---

## 🟡 Low

- **L-1** `bookings.updateStatus` (`:2621`) هو `protectedProcedure` مع فحص inline `['admin','SUPER_ADMIN']` بدل `adminProcedure` — صحيح اليوم، لكن inconsistent وقابل للكسر مستقبلًا.
- **L-2** `kyc.getByUserId` (`:693`) — أي مستخدم مُصادَق يقدر يقرا حالة KYC ديال أي `userId` (status+verifiedAt فقط، بلا مستندات) → enumeration.
- **L-3** `translation.translateText` / `translation.clearCache` (`:3751+`) `protectedProcedure` — أي مستخدم مُصادَق يقدر يحرق quota ديال AWS Translate، و`clearCache(listingId)` كيخلي cache-thrash لأي إعلان.
- **L-4** `sanitizeTrpcInput` (middleware عام) كيعمل HTML-escape لكل النصوص المدخلة → تفسد البيانات المخزّنة (double-encoding، URLs فيها `&`) وتعطي إحساسًا زائفًا بأمان XSS.
- **L-5** `/api/scheduled/lease-end-reminder` و`/api/scheduled/ical-sync` بلا `verifyCron` على الـ route (`app.ts`)، كيعتمدو على فحص داخلي `sdk.authenticateRequest` + `isCron && taskUid` (`leaseReminder.ts:13`). صحيح، لكن inconsistent مع `/api/cron/*`؛ زيادة middleware للدفاع في العمق.
- **L-6** `leaseReminder.ts:76` كيرجّع `error.stack` فـ JSON ديال الخطأ → تسريب stack trace.
- **L-7** PayTabs webhook: `const paid = !code || /^(success...)/` — غياب حقل الحالة كيتفسّر **مدفوع**. آمن افتراضيًا لأن التوقيع مطلوب (`payments/webhooks.ts`)، لكن المنطق خاصه يفسّر الغياب كفشل.
- **L-8** SSRF عبر redirect: `urlGuard` كيتحقق من الـ URL الأولي فقط، و`fetch` كيتبع 302 بلا إعادة تحقق من الهدف (يحتاج مالك مُصادَق + host خبيث). الباقي قوي: كيحجب 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1 وكيفحص كل عناوين DNS (مُختبَر ضد `169.254.169.254`).
- **L-9** `.env.production.example` كيوثّق `VITE_SUPABASE_ANON_KEY` و`VITE_FRONTEND_FORGE_API_KEY` — حاليًا **غير مستعملين** في `client/src` (grep نظيف)، لكن إذا تفعّلو كيتشحنو للبندل. و`anon key` خطر غير بعد تفعيل RLS (H-1/H-2).
- **L-10** `X-XSS-Protection: 1; mode=block` header مهجور وقادر يدخّل ثغرات في متصفحات قديمة → يُنصح بـ `0`.

---

## ✅ نقاط قوية (مُحصّنة أصلًا)
- **SQL injection:** لا وجود له. كل الـ raw SQL parameterized (`sql\`...\``) وكل الاستعلامات عبر drizzle builders (`ilike/eq/inArray`).
- **Zod:** كل mutations عندها `.input(...)` باستثناء 3 بلا مدخل مستخدم (`logout`, `markAllRead`, `cleanupDemoData` — كلهم مستخدم-scoped/admin).
- **Auth tiers:** `requireUser` كيفحص `accountStatus`؛ `admin`/`super` routers كلها `adminProcedure`/`superAdminProcedure`؛ `ownerFinancials` مقيّد بـ `ctx.user.id`.
- **كلمات السر:** scrypt + salt + `timingSafeEqual` + advisory locks لكل من owner/renter/partner.
- **الجلسات:** HS256، `resolveSessionSecret` بلا default ثابت (env ولا random مخزّن فـ DB)، كوكي `httpOnly`/`sameSite: strict`/`secure`، وبوابة إقلاع ترفض `JWT_SECRET` ناقص/قصير.
- **CSRF/CSP/headers** + مزامنة CSP مع `vercel.json` (`cspParity.test.ts`).
- **SSRF guard** مُختبَر (`voiceTranscription.test.ts` كيحجب 169.254.169.254).
- **Webhooks** مُوقّعة (verification HMAC constant-time مع tolerance، Morocco gateways fail-closed عند غياب السر).
- **رفع الملفات:** enums صارمة للـ mime + حدود حجم + re-encode/watermark؛ disputes فيها allowlist للمرفقات؛ `storage/` proxy كيفرض owner/admin على `kyc/` و`checkout/`.

---

## 🎯 الأولويات المقترحة (بالترتيب)
1. **H-1/H-2** → قرار صريح: إما `FORCE RLS` + role غير superuser، أو توثيق قبول المخاطرة + إضافة اختبار يفرض `eq(ownerId, ...)`.
2. **H-3** → بوابة bootstrap للمالك (token/env) ورفض الإقلاع الإنتاجي إذا لم يُعدّ.
3. **M-3/M-4/M-5** → `limit` على search/list، وlimiter موزّع، وتغطية `/storage/*`.
4. **M-2** → فصل مفتاح الجلسة عن `DIRECT_LOGIN_PASSWORD`، وvetting إداري للشريك (ترقية لـ `owner` بعد المراجعة).
5. الباقي (Low) كتحسينات تدريجية.

---

## 📌 حالة الإصلاحات

| المعرّف | الحالة | الملفات |
| --- | --- | --- |
| **H-3** | ✅ مُصلَّح | `server/_core/directAuth.ts` (بوابة `OWNER_SETUP_TOKEN` + مقارنة constant-time)، `server/_core/env.ts` (`ownerSetupToken` + `assertProductionOwnerConfigured`)، `.env.production.example` |
| **M-3** | ✅ مُصلَّح | `server/routers.ts` (`MAX_LISTING_ROWS = 500` + `.limit(...)` على `listings.list` و `listings.search`) |
| **M-1** | ✅ مُصلَّح | `server/_core/trpc.ts` (tier جديد `partnerProcedure` + `ownerProcedure` بلا `partner`)، `server/routers.ts` (21 route → `partnerProcedure`؛ `bookings.ownerList`/`ownerUpdateStatus`/`admin.ownerFinancials`/`payouts.request`/`rentalContracts.createForBooking` بقاو owner/admin فقط) |
| **M-7** | ✅ مُصلَّح | `server/routers.ts` (`toPublicListing` كيحذف `whatsappPhone`؛ `getById` ما بقاش كيجيب الرقم الخاص إلا للمالك/Admin عبر استعلام مقيّد)، `client/src/pages/Checkout.tsx` (CTA كيستعمل `whatsappNumber`/`agencyPhone` العموميين فقط) |
| H-1, H-2 | ⏳ مفتوح | `supabase/rls.sql`, `server/db.ts` |
| M-2, M-4 → M-6 | ⏳ مفتوح | — |
| L-1 → L-10 | ⏳ مفتوح | — |

### تفاصيل الإصلاحات المنجزة

**Fix 1 — H-3 (تأمين أول تشغيل للمالك):**
- `POST /api/auth/owner-setup` كيطلب الآن `OWNER_SETUP_TOKEN` (عبر header `x-owner-setup-token` أو `setupToken`/`ownerSetupToken` في الجسم). بلا التوكن → `403 { reason: "setup_disabled" }`؛ بتوكن غالط → `403 { reason: "invalid_setup_token" }`. المقارنة `safeEqual` (constant-time).
- `env.ts` كيقرا `OWNER_SETUP_TOKEN` بلا default (fail-closed)، و`assertProductionOwnerConfigured()` كتلوّح بتحذير خطير عند الإقلاع الإنتاجي بلا أي credential للمالك.

**Fix 2 — M-3 (حدود قاعدة البيانات):**
- `listings.list` و`listings.search` كيستعملو `.limit(MAX_LISTING_ROWS)` (500 صف) قبل التصفيح داخل الذاكرة، حتى استعلام عام غير مُصادَق ما يجيبش الجدول كامل.

**Fix 3 — M-7 (رقم الواتساب الخاص):**
- `toPublicListing` كيحذف الآن `whatsappPhone` من أي payload عام (دفاع في العمق)، و`listings.getById` ما بقاش كيselecteha فـ join العمومي — الرقم الخاص كيتجاب غير للمالك أو Admin، باستعلام منفصل ومقيّد (`ctx.user.id === listing.ownerId` أو role إداري).
- `listings.list`/`listings.search` كانو أصلًا نقيين (غير `ownerName` + `ownerRole`) والاختبارات كتفرض ذلك — زدنا تأكيد.
- `Checkout.tsx` كيخدم الآن بـ `whatsappNumber` (العمومي) ثم `agencyPhone`، بلا أي fallback للرقم الخاص.
- ملاحظة متبقية (خارج نطاق الطلب): `Success.tsx` و`Voucher.tsx` مازال كيستعملو `ownerWhatsApp` (نفس الرقم الخاص) فـ CTA ما بعد تأكيد الحجز — مرشحة لنفس الإصلاح إذا بغيت الرقم العمومي فقط.

**Fix 4 — M-1 (تصعيد صلاحيات الشريك):**
- tier جديد `partnerProcedure` (`owner`/`admin`/`partner`/`SUPER_ADMIN`) = «إعلاناتك + إعدادات وكالتك فقط»، و`ownerProcedure` ولّى `owner/admin/SUPER_ADMIN` فقط.
- 21 route تحوّلو لـ `partnerProcedure`: `agency.*` (8، كلها مقيّدة بـ `ctx.user!.id`) + `storage.uploadAgencyLogo`/`uploadImage` + `listings.*` (11).
- بقاو على `ownerProcedure`: `bookings.ownerList` (بيانات الرينترز)، `bookings.ownerUpdateStatus`، `admin.ownerFinancials`، `payouts.request`، `rentalContracts.createForBooking` — أي شريك ذاتي التسجيل ما بقاش يوصل ليهم.
- اختبار سلوكي جديد فـ `multi-agency.isolation.test.ts`: شريك كيتلقى `FORBIDDEN` على الخمسة دواوز.
