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

> ✅ **تم الإصلاح** (Fix 11) — شوف قسم «حالة الإصلاحات» أسفله.

### H-2 — اتصال التطبيق نفسه كيتجاوز RLS (بلا `FORCE ROW LEVEL SECURITY`)
`server/db.ts` كيتصل عبر `drizzle-orm/postgres-js` بـ `DATABASE_URL` = الصف المَجْمُوع `postgres.<ref>` ديال Supabase، وهو role كيتجاوز RLS. حتى الـ policies داخلة على claim `app_user_id` من `request.jwt.claims` (`rls.sql:30-38`) اللي **التطبيق ما كيصدرهش أبدًا** (الجلسات هي HS256 ديال التطبيق). المعنى: **RLS غير مُطبّقة على مسار الاتصال الحقيقي**، والعزل الوحيد هو التطبيق (`ownerProcedure` + `eq(listings.ownerId, ctx.user.id)`).

**الخطر:** خطأ واحد فـ router جديد (نسيان `eq(ownerId, ...)`) = تسريب بيانات بين المستأجرين بلا أي شبكة أمان فـ DB.
**توصية:** `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + role تطبيقي غير superuser مع `SET app.current_user_id`، ولا قبول صريح موثّق.

> 🟡 **قيد معروف — تحسين app-side مؤجَّل:** `FORCE ROW LEVEL SECURITY` ولّى مطبَّق على جميع الجداول فـ `supabase/rls.sql` (شوف H-1)، ولكن الاتصال المَجْمُوع (`postgres.<ref>`) اللي كيستعملو التطبيق كيحمل `BYPASSRLS` — قيد معروف فـ اتصالات Supabase المَجْمُوعة. الإغلاق الكامل كيتطلب role تطبيقي غير `BYPASSRLS` + `SET LOCAL request.jwt.claims` لكل طلب فـ `server/db.ts` — تحسين مؤجَّل. الحماية الأساسية حاليًا: tRPC guards (`ownerProcedure` + `eq(ownerId, ...)`).

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

> ✅ **تم الإصلاح** (Fix 5) — شوف قسم «حالة الإصلاحات» أسفله.

### M-3 — `listings.search` و `listings.list` بلا `.limit()`
`routers.ts:1938` (search) و`:1807` (list) كيجيبو **كل صفوف الجدول** للذاكرة ثم التصفيح/الفلترة فـ JS. العام/غير مُصادَق → استهلاك ذاكرة/CPU وDoS مع نمو الكتالوج. `pageSize` (max 200) ما كيأثرش على الاستعلام.

> ✅ **تم الإصلاح** (Fix 2) — شوف قسم «حالة الإصلاحات» أسفله.

### M-4 — Rate limiter في الذاكرة (in-memory `Map`)
`security.ts:7` — `buckets = new Map()`. على serverless/عدة instances، كل نسخة عندها budget خاص، وcold start كيرجّع العداد. معنى الحماية من الـ brute force على `strict-auth` (5/min) و`strict-payment` هي "best effort" فقط. يُنصح بـ Redis/Upstash أو rate limiting على الـ edge.

> ✅ **تم الإصلاح** (Fix 6) — شوف قسم «حالة الإصلاحات» أسفله.

### M-5 — `/storage/*` خارج `/api/` → بلا rate limiting
`app.ts` + `storageProxy.ts:66` — القاعدة `app.use("/api/", apiRateLimit)` ما كتشملش `/storage/*`. كل طلب كيولّد `createSignedUrl` عند Supabase → cost/DoS خفيف.

> ✅ **تم الإصلاح** (Fix 7) — شوف قسم «حالة الإصلاحات» أسفله.

### M-6 — أسطح spam عامة كتصيفط notifications/emails (bucket `standard` = 300/min فقط)
- `requestListing.create` (`:3460`, public) — فيه idempotency على `requestId`+`phone` و`dedupeKey: lead:${phone}`، لكن تدوير الأرقام كيولّي spam للـ admins.
- `supportTickets.create` (`:1714`) — كيوصّل لكل الأدمنز.
- `comments.create` / `reviews.create` — `reviews.create` مقيّد بحجز مكتمل، `comments.create` لا.
- `listings.trackEvent` (`:1991`) — public mutation كيكتب صفوف analytics.

> ✅ **تم الإصلاح** (Fix 8) — شوف قسم «حالة الإصلاحات» أسفله.

### M-7 — رقم الواتساب الخاص (إشعارات الحجز) مكشوف عمومًا
`listings.getById` (`:2014-2026`) و`search`/`list` كيرجّعو `whatsappPhone` + `whatsappNumber` + `agencyPhone` بلا مصادقة، و`Checkout.tsx:209` كتفضّل `whatsappPhone` (رقم الإشعارات الخاص) على `whatsappNumber` (العمومي). هذا كيناقض سياسة "الرقم ما كيتكشفش حتى التأكيد" المتبعة فـ `bookings.getById`.

> ✅ **تم الإصلاح** (Fix 3) — شوف قسم «حالة الإصلاحات» أسفله. ملاحظة: `list`/`search` أصلًا ما كانوش كيرجّعو أي هاتف (غير `ownerName`/`ownerRole`) — الكشف كان فـ `getById` فقط.

---

## 🟡 Low

- **L-1** `bookings.updateStatus` (`:2621`) هو `protectedProcedure` مع فحص inline `['admin','SUPER_ADMIN']` بدل `adminProcedure` — صحيح اليوم، لكن inconsistent وقابل للكسر مستقبلًا. → ✅ **تم الإصلاح** (Fix 9).
- **L-2** `kyc.getByUserId` (`:693`) — أي مستخدم مُصادَق يقدر يقرا حالة KYC ديال أي `userId` (status+verifiedAt فقط، بلا مستندات) → enumeration. → ✅ **تم الإصلاح** (Fix 9).
- **L-3** `translation.translateText` / `translation.clearCache` (`:3751+`) `protectedProcedure` — أي مستخدم مُصادَق يقدر يحرق quota ديال AWS Translate، و`clearCache(listingId)` كيخلي cache-thrash لأي إعلان. → ✅ **تم الإصلاح** (Fix 10) — الجوج تحوّلو لـ `adminProcedure`.
- **L-4** `sanitizeTrpcInput` (middleware عام) كيعمل HTML-escape لكل النصوص المدخلة → تفسد البيانات المخزّنة (double-encoding، URLs فيها `&`) وتعطي إحساسًا زائفًا بأمان XSS. → ✅ **تم الإصلاح** (Fix 9) — حيّدنا الـ middleware نهائيًا ومنعتمد على React + output-boundary escaping.
- **L-5** `/api/scheduled/lease-end-reminder` و`/api/scheduled/ical-sync` بلا `verifyCron` على الـ route (`app.ts`)، كيعتمدو على فحص داخلي `sdk.authenticateRequest` + `isCron && taskUid` (`leaseReminder.ts:13`). صحيح، لكن inconsistent مع `/api/cron/*`؛ زيادة middleware للدفاع في العمق. → ✅ **تم الإصلاح** (Fix 10) — `verifyScheduledTask` على الـ route: كيقبل `x-vercel-cron`/`CRON_SECRET` أو جلسة cron موقّعة ديال المنصة، والفحص الداخلي باقي (طبقتين حماية).
- **L-6** `leaseReminder.ts:76` كيرجّع `error.stack` فـ JSON ديال الخطأ → تسريب stack trace. → ✅ **تم الإصلاح** (Fix 9) — الـ stack بقى فـ السيرفر log فقط.
- **L-7** PayTabs webhook: `const paid = !code || /^(success...)/` — غياب حقل الحالة كيتفسّر **مدفوع**. آمن افتراضيًا لأن التوقيع مطلوب (`payments/webhooks.ts`)، لكن المنطق خاصه يفسّر الغياب كفشل. → ✅ **تم الإصلاح** (Fix 10) — `isPaytabsPaidStatus`: غياب/فراغ الحالة = `failed` (fail-closed).
- **L-8** SSRF عبر redirect: `urlGuard` كيتحقق من الـ URL الأولي فقط، و`fetch` كيتبع 302 بلا إعادة تحقق من الهدف (يحتاج مالك مُصادَق + host خبيث). الباقي قوي: كيحجب 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1 وكيفحص كل عناوين DNS (مُختبَر ضد `169.254.169.254`). → ✅ **تم الإصلاح** (Fix 10) — `fetchGuarded`: متابعة redirects يدويًا وإعادة فحص كل hop بـ `validateExternalUrl` (حد 5 hops).
- **L-9** `.env.production.example` كيوثّق `VITE_SUPABASE_ANON_KEY` و`VITE_FRONTEND_FORGE_API_KEY` — حاليًا **غير مستعملين** في `client/src` (grep نظيف)، لكن إذا تفعّلو كيتشحنو للبندل. و`anon key` خطر غير بعد تفعيل RLS (H-1/H-2). → ✅ **تم الإصلاح** (Fix 10) — تحيّدو من القالب مع تعليق يمنع الرجوع ليهم، والتحديث شمل `docs/deployment-env-checklist.md`.
- **L-10** `X-XSS-Protection: 1; mode=block` header مهجور وقادر يدخّل ثغرات في متصفحات قديمة → يُنصح بـ `0`. → ✅ **تم الإصلاح** (Fix 9) — `0` فـ Express و`vercel.json` (parity مُختبَر).

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
1. **H-1** ✅ مُصلَّح — RLS شاملة على جميع الجداول فـ `supabase/rls.sql` (Fix 11). **H-2** → تحسين app-side مؤجَّل: role تطبيقي غير `BYPASSRLS` + `SET LOCAL request.jwt.claims`؛ الـ tRPC guards هي الحماية الأساسية حاليًا.
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
| **M-2** | ✅ مُصلَّح | `server/_core/env.ts` (`cookieSecret` من `JWT_SECRET` فقط + تحذير خطير إذا `DIRECT_LOGIN_PASSWORD` مُعدّ بلا `JWT_SECRET`)، `server/_core/sessionSecret.ts`، `drizzle/schema.ts` |
| **M-4** | ✅ مُصلَّح | `server/_core/security.ts` (`@upstash/ratelimit` + `@upstash/redis`: sliding window ذرّي مشترك لكل الـ tiers؛ fallback للذاكرة محليًا مع تحذير مرة واحدة)، `package.json` |
| **M-5** | ✅ مُصلَّح | `server/_core/security.ts` (`storageProxyLimiter` = 240/min/IP)، `server/_core/app.ts` (`app.use("/storage/", storageProxyLimiter)` قبل `registerStorageProxy`) |
| **M-7 (UI)** | ✅ مُصلَّح | `server/routers.ts` (`bookings.getById`/`vouchers.getByCode` كيرجّعو `agencyWhatsApp` العمومي بدل الرقم الخاص)، `client/src/pages/Success.tsx`، `client/src/pages/Voucher.tsx` |
| **M-1 (UI)** | ✅ مُصلَّح | `client/src/pages/HostDashboard.tsx` + `client/src/pages/AgencyDashboard.tsx` (إخفاء الأقسام المالية/الحجوزات/التحليلات عن tier الشريك — بلا أي ترقية تلقائية) |
| **H-1** | ✅ مُصلَّح | `supabase/rls.sql` (تعاود كتابته بالكامل — RLS + `FORCE` على جميع الـ 27 جدول (بدل 8)، grants/policies صارمة، الجداول الداخلية deny-all) |
| **H-1 (تنظيف)** | ✅ مُصلَّح | `supabase/drop-legacy-tables.sql` (حذف الجداول الموروثة `cars`/`products`/`profiles` — ما بقا حتى جدول خارج RLS) |
| **H-2** | 🟡 مؤجَّل — تحسين app-side | `server/db.ts` (role تطبيقي غير `BYPASSRLS` + `SET LOCAL request.jwt.claims` لكل طلب؛ القيد الحالي: `postgres.<ref>` كيحمل `BYPASSRLS`) |
| **M-6** | ✅ مُصلَّح | `server/_core/security.ts` (`SPAM_GUARD_LIMITS` + `checkRateLimit`)، `server/_core/trpc.ts` (`spamGuard`)، `server/routers.ts` (guards على `requestListing.create`/`supportTickets.create`/`comments.create`/`listings.trackEvent`) |
| **L-1, L-2, L-4, L-6, L-10** | ✅ مُصلَّح | `server/routers.ts` (`updateStatus`→`adminProcedure`؛ `kyc.getByUserId` مقيّد بالمالك/Admin)، `server/_core/trpc.ts` + `server/_core/security.ts` (حياد `sanitizeTrpcInput`)، `server/leaseReminder.ts` (بلا stack)، `vercel.json` + `server/_core/security.ts` (`X-XSS-Protection: 0`) |
| **L-3, L-5, L-7, L-8, L-9** | ✅ مُصلَّح | `server/routers.ts` (translation → `adminProcedure`)، `server/middleware/cronAuth.ts` + `server/_core/app.ts` (`verifyScheduledTask` على `/api/scheduled/*`)، `server/payments/webhooks.ts` (fail-closed)، `server/security/urlGuard.ts` (إعادة فحص redirect hops)، `.env.production.example` |

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
- ~~ملاحظة متبقية (خارج نطاق الطلب): `Success.tsx` و`Voucher.tsx` مازال كيستعملو `ownerWhatsApp`~~ → ✅ عُلِّجت فـ «UI Fix A» أسفله (الـ CTA ولّى كيستعمل `agencyWhatsApp` العمومي فقط).

**Fix 4 — M-1 (تصعيد صلاحيات الشريك):**
- tier جديد `partnerProcedure` (`owner`/`admin`/`partner`/`SUPER_ADMIN`) = «إعلاناتك + إعدادات وكالتك فقط»، و`ownerProcedure` ولّى `owner/admin/SUPER_ADMIN` فقط.
- 21 route تحوّلو لـ `partnerProcedure`: `agency.*` (8، كلها مقيّدة بـ `ctx.user!.id`) + `storage.uploadAgencyLogo`/`uploadImage` + `listings.*` (11).
- بقاو على `ownerProcedure`: `bookings.ownerList` (بيانات الرينترز)، `bookings.ownerUpdateStatus`، `admin.ownerFinancials`، `payouts.request`، `rentalContracts.createForBooking` — أي شريك ذاتي التسجيل ما بقاش يوصل ليهم.
- اختبار سلوكي جديد فـ `multi-agency.isolation.test.ts`: شريك كيتلقى `FORBIDDEN` على الخمسة دواوز.

**Fix 5 — M-2 (فصل مفتاح الجلسة عن `DIRECT_LOGIN_PASSWORD`):**
- `env.ts`: `cookieSecret` ولّى `JWT_SECRET` فقط — `DIRECT_LOGIN_PASSWORD` ما بقاش أبدًا مفتاح توقيع الجلسات. بلا `JWT_SECRET`، `resolveSessionSecret` كيبقى عندو الـ fallback ديال سر عشوائي مُخزَّن فـ `platform_settings` (بلا أي secret ثابت فـ الـ repo).
- عند الإقلاع بلا `JWT_SECRET` ومع `DIRECT_LOGIN_PASSWORD` مُعدّ، كيتطبع تحذير بخطورة عالية (`logger.error`) كيوضّح أن كلمة سر الباب الخلفي ما خاصهاش تكون session secret فـ الإنتاج.
- بوابة الإنتاج (`assertProductionOwnerConfigured`) مازالة كترفض `JWT_SECRET` ناقص/قصير.

**Fix 6 — M-4 (rate limiter موزّع):**
- `security.ts` كيستعمل الآن `@upstash/ratelimit` + `@upstash/redis` ملي تكون `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` مُعدّة: sliding window ذرّي على مخزن مشترك = **budget واحد** لكل الـ instances والـ regions (كل tier عندو `Ratelimit` خاص به + `prefix` خاص).
- `timeout: 1000ms` (fail-fast) + headers `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` فـ كل الحالات.
- إذا Redis غير مُعدّ (dev/CI) ولا رجع خطأ/تجاوز الوقت: fallback تلقائي للـ Map المحلية + تحذير مرة واحدة (`warnMemoryFallback`) — الحماية ما كتطيحش أبدًا لصفر، والمسار المحلي بقى متزامن (الاختبارات المثبتة ما تبدلوش).

**Fix 7 — M-5 (تغطية `/storage/*` بـ rate limiting):**
- `storageProxyLimiter` جديد بـ **240/min/IP** (≈4 req/s) فـ `security.ts`، و`app.ts` كيطبّقه (`app.use("/storage/", ...)`) قبل `registerStorageProxy`.
- لماذا 240 ماشي 5؟ صفحة بحث وحدة كتستعمل حتى 50 صورة والتصفّح العادي كيتجاوز 5/min بزاف — الهدف هو تحديد كلفة/DoS ديال الـ scraper (كل طلب كيولّد Supabase `createSignedUrl`) بلا ما يتقطع عرض الجاليري.

**UI Fix A — إكمال M-7 (الرقم العمومي فـ Success/Voucher):**
- السيرفر: `bookings.getById` و`vouchers.getByCode` كيرجّعو الآن `agencyWhatsApp` (`users.whatsappNumber` — العمومي) بدل `ownerWhatsApp`، والرقم الخاص ما بقاش كيتselecta فهاد المسارات؛ select ميّت فـ `payments.create` تنقّى.
- الكليان: `Success.tsx` و`Voucher.tsx` كيستعملو `agencyWhatsApp` فقط؛ ملي ما يكونش الرقم العمومي متوفر، `Success.tsx` كيبان رسالة عربية واضحة بدل رابط فارغ.
- اختبارات مُثبَّتة: `not.toMatch(/ownerWhatsApp\s*:/)` على `routers.ts` و`not.toMatch(/booking\??\.ownerWhatsApp/)` على `Success.tsx`.

**UI Fix B — إكمال M-1 (إخفاء أقسام المالك عن الشريك):**
- `HostDashboard.tsx`: قسم «الأرباح والتسويات» (مع طلب السحب) وقسم «طلبات الحجز» كيتعرضو غير لـ `owner`/`admin`/`SUPER_ADMIN` (`isOwnerTier`) — بلا أي ترقية تلقائية لـ `partner`.
- `AgencyDashboard.tsx`: تابات «الحجوزات والتحقق من الوثائق» و«التحليلات والتقارير» مخفيين على الشريك، والـ tab الافتراضي كيولّي «الأسطول والأسعار». (KPI cards من `agency.overview` — `partnerProcedure` مقيّد بـ `ctx.user.id` — بقاو ظاهرين بشكل مقصود.)

**Fix 8 — M-6 (spam guards داخل الـ tRPC router):**
- `security.ts`: `checkRateLimit(identifier, { namespace, windowMs, max })` جديد كيعيد `{ success, limit, remaining, reset, count }`، و`consumeLocalRateLimit` مشترك بين الـ Express middleware والـ guards — **نفس المخزن** (Redis إذا مُعدّ، وإلا Map محلية + `warnMemoryFallback` مرة وحدة). الـ identifier ديما `clientIp(req)` (trust-proxy) كيف الـ tiers الأخرى.
- `trpc.ts`: `spamGuard(surface)` كيرمي `TRPCError` بـ `TOO_MANY_REQUESTS` قبل ما يوصل الطلب للـ handler. الـ guards تحطّو **بعد** `requireUser` (المحاولات غير المُصادَق عليها ما كتاكلش من quota ديال الـ IP).
- الحدود (`SPAM_GUARD_LIMITS`) لكل surface بوحدو:
  - `requestListing.create` → **10/min/IP** (فورم عام؛ تدوير الأرقام كيصبّ فـ inbox ديال الأدمنز، و10 كافي جدًا لزائر حقيقي).
  - `supportTickets.create` → **5/min/IP** (كيوصّل لكل الأدمنز).
  - `comments.create` → **10/min/IP** (محتوى مكتوب؛ `reviews.create` أصلًا مقيّد بحجز مكتمل).
  - `listings.trackEvent` → **60/min/IP** (=1 كتابة/ثانية؛ كل view/click كيكتب صف analytics، والزائر العادي ما خاصو يتقطع أبدًا).
- اختبارات: `server/spam-guard.test.ts` (سلوكي: الرفض بعد الحد، استقلال الـ IPs، ترتيب الـ guard مع المصادقة) + pins فـ `server/readiness.security.test.ts` + `tests/integration/rate-limiter.test.ts` (وحدة `checkRateLimit`).

**Fix 9 — L-1, L-2, L-4, L-6, L-10:**
- **L-1** `bookings.updateStatus` ولّى `adminProcedure` — الـ admin tier كيتعبّر عليه بنوع الـ procedure، بلا فحص inline (`['admin','SUPER_ADMIN']`) اللي كان قابل للكسر فـ refactor.
- **L-2** `kyc.getByUserId` ولّى مسموح غير لصاحب الريكورد (`ctx.user.id === input.userId`) أو Admin/SUPER_ADMIN — أي محاولة قراءة status ديال مستخدم آخر كترجع `FORBIDDEN`.
- **L-4** حيّدنا `sanitizeTrpcInput` + الـ middleware العام نهائيًا: الإدخال كيتخزّن **verbatim** (بلا double-encoding لـ URLs/emails/passwords). الـ XSS بقى مُعالج فـ output boundaries: React كيهرب فـ render، JSON-LD serializer كيهرب `<` (`client/src/lib/seo.ts`)، prerender + notification emails كيهربو فـ بلدانهم. الـ helpers الميدانية (`sanitizeUserContent`/`escapeHtml`) بقاو للنصوص اللي غادية مباشرة لـ HTML. ⚠️ ملاحظة ترحيل: أي حساب قديم فيه `&`/`<`/`'` فـ كلمة السر خاصو reset (الهاش ديالو تحسب على نسخة مهرّبة قديمًا).
- **L-6** `leaseReminder.ts` ما بقاش كيرجّع `error.stack` فـ JSON — الـ stack باقي غير فـ `console.error` ديال السيرفر؛ الردّ فيه غير message + context غير حساس.
- **L-10** `X-XSS-Protection: 0` فـ `security.ts` و`vercel.json` (بدل `1; mode=block`)، و`server/cspParity.test.ts` كيثبّت التطابق فـ الجوج.
- اختبارات: `tests/integration/xss-sanitization.test.ts` (عاود كتبناها: helpers الميدانية + غياب المهرّب العام)، pins جديدة فـ `server/readiness.security.test.ts`.

**Fix 10 — L-3, L-5, L-7, L-8, L-9:**
- **L-3** `translation.translateText` و`translation.clearCache` ولّاو `adminProcedure` — المستخدم العادي ما بقاش قادر يحرق quota ديال AWS Translate ولا يعمل cache-thrash لأي إعلان.
- **L-5** الـ routes ديال `/api/scheduled/lease-end-reminder` و`/api/scheduled/ical-sync` ولّى عليهم guard قبل الـ handler: `verifyScheduledTask` (`server/middleware/cronAuth.ts`) كيقبل إما `x-vercel-cron`/`CRON_SECRET` (نفس `/api/cron/*`) وإما **جلسة cron موقّعة** (`isCron && taskUid` عبر `sdk.authenticateRequest`). لماذا ماشي `verifyCron` بوحدو؟ حيت هاد المسارات كيتصلو بيهم **منصة Manus heartbeat** بجلسة cron (مهمة `ALTUSplace-ical-sync-hourly` فعلية)، و`verifyCron` الصرف كان غادي يرد 401 على كل نداء إنتاجي. الـ handlers باقي فيهم الفحص الداخلي — defense in depth بطبقتين.
- **L-7** `isPaytabsPaidStatus` (مُصدَّرة للاختبارات): غياب/فراغ `tran_status`/`status` كيتفسّر **failed** (fail-closed) بدل مدفوع؛ النجاح غير بالقيم الصريحة (`success/paid/settled/authorised/approved/1`). التوقيع (`verifyPaytabsCallback`) مازال إجباري قبل أي تسوية.
- **L-8** `urlGuard`: زدنا `fetchGuarded` — طلبات `redirect: "manual"` مع متابعة يدوية، وكل hop كيتفحص بـ `validateExternalUrl` قبل الاتصال (HTTPS-only + قائمة السماح + رفض العناوين الخاصة/الداخلية، حد `MAX_REDIRECTS = 5`). مطبّق على `fetchExternalText` (iCal) و`fetchExternalBytes` (voice).
- **L-9** `VITE_SUPABASE_ANON_KEY` و`VITE_FRONTEND_FORGE_API_KEY` تحيّدو من `.env.production.example` (بتعليق واضح يمنع إضافتهم مستقبلًا)، و`docs/deployment-env-checklist.md` تحدّث باش ما يبقاش يشجّع عليهم.
- اختبارات: `server/payments/webhooks.paytabs.test.ts` (جديد — fail-closed)، تمديد `server/security/urlGuard.test.ts` (302 → شبكة خاصة مرفوض، سلسلة redirect عمومية، حد الحلقات)، تمديد `server/cron/cronAuth.test.ts` (`verifyScheduledTask`)، وpins جديدة فـ `server/readiness.security.test.ts`.

**Fix 11 — H-1 (RLS شاملة على جميع الجداول):**
- `supabase/rls.sql` تعاود كتابته بالكامل: `enable` + `FORCE ROW LEVEL SECURITY` على جميع الـ 27 جدول (بدل 8)، مع `REVOKE ALL` من `anon`/`authenticated` ثم grants دقيقة لكل دور؛ الجداول الداخلية (`platform_settings`, `commission_tiers`, `audit_logs`, `translations`, `listing_analytics_events`) ولّاو deny-all من جهة الكليان.
- Policies صارمة على أساس claim `app_user_id` + `app_is_admin()`: قراءة عمومية محدودة (`listings` غير بالحالات المنشورة `Published`/`Available`/`Approved` — نفس `PUBLIC_LISTING_STATUSES`، و`users` غير `id`/`name`/`agency_logo_url` لمالكي إعلانات منشورة)، وكل مستخدم مُصادَق كيقرا/كيعدّل صفوفو هو فقط.
- الكتابة المباشرة من الكليان محدودة بالمسارات الضرورية فقط: طلبات الشراكة (دائمًا `pending`)، تعديل البروفايل، CRUD ديال الإعلانات للمالك، و`read_at` ديال الإشعارات؛ كتابات `bookings`/`payments`/`kyc_submissions` تحيّدو (كلهم عبر السيرفر). السكريبت idempotent وكيتشغّل يدويًا فـ Supabase SQL editor مورا الـ drizzle migrations.

**Fix 12 — تنظيف الجداول الموروثة (مكمّل H-1):**
- الجداول `cars` / `products` / `profiles` كانو بقايا ديال القالب خارج `drizzle/schema.ts`، غير مستعملين فـ التطبيق، وخارج نطاق الـ RLS الجديدة؛ `products`/`profiles` كانو مازال فيهم policies قديمة permissive.
- تحيّدو من قاعدة البيانات بـ `DROP TABLE IF EXISTS ... CASCADE` — السكريبت محفوظ فـ `supabase/drop-legacy-tables.sql`. Pre-flight قبل الحذف: لا FKs لا views dependents؛ `cars` كان فيه 4 صفوف و`products`/`profiles` خاويين.
- النتيجة النهائية فـ الإنتاج: **27 جدول** — كلهم `RLS enable` + `FORCE`، و**31 policy**، بلا أي جدول خارج الحماية.
