import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";
import { formatApiError } from "@/lib/apiError";
import { useSEO } from "@/lib/seo";

const AGENCY_NAME_MIN = 2;
const AGENCY_NAME_MAX = 80;
const PARTNER_PASSWORD_MIN = 8;

const benefits = [
  {
    icon: ShieldCheck,
    title: "الحماية والأمان",
    description: "إجراءات تحقق صارمة تحمي عروضك وعملاءك من البداية.",
    points: ["التحقق من المستأجرين قبل تأكيد الحجز", "فحص صور تلقائي بالذكاء الاصطناعي", "عروضك معزولة تماماً عن أي وكالة أخرى"],
  },
  {
    icon: WalletCards,
    title: "التحكم المالي والمدفوعات",
    description: "متابعة شفافة لأرباحك مع سحوبات سريعة ومرنة.",
    points: ["تتبع واضح للإيرادات والعمولات", "سحوبات إلى حسابك البنكي أو Cash Plus أو وفاكاش", "لوحة إحصائيات وأرباح محدَّثة لحظياً"],
  },
  {
    icon: TrendingUp,
    title: "التميز في السوق",
    description: "أبرز عروضك أمام جمهور حقيقي يبحث عن الكراء.",
    points: ["إبراز الإعلانات أمام آلاف الباحثين", "تصنيف حسب المدينة والمدة (سيارات وعقارات)", "مؤشرات أداء: مشاهدات ونقرات تواصل وتحويل"],
  },
] as const;

/**
 * Self-service partner auth. Both endpoints mint the same `app_session_id`
 * cookie the rest of the platform uses, so refresh() below picks up the new
 * partner session immediately.
 */
async function callPartnerAuth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  let payload: { error?: string; reason?: string } | null = null;
  try {
    payload = (await response.json()) as { error?: string; reason?: string };
  } catch {
    // non-JSON error body: fall back to the generic message below
  }
  if (!response.ok) {
    throw new Error(payload?.error || "حدث خطأ غير متوقع. حاول مرة أخرى.");
  }
  return payload as T;
}

type PartnerSession = {
  success: boolean;
  role: string;
  redirectTo: string;
};

export default function AgencyOnboarding() {
  useSEO({ title: "سجّل وكالتك واربح من الكراء | ALTUSplace", description: "انضم إلى ALTUSplace كمالك أو وكالة واعرض سياراتك وعقاراتك للكراء في المغرب.", path: "/become-agency", canonicalPath: "/become-agency" });
  const { t } = useLanguage();
  const { user, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();

  const [mode, setMode] = useState<"register" | "login">("register");
  const [agencyName, setAgencyName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailStepError, setEmailStepError] = useState<string | null>(null);
  const [emailStepDone, setEmailStepDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPrivileged =
    user?.role === "owner" || user?.role === "admin" || user?.role === "partner" || user?.role === "SUPER_ADMIN";

  const goToDashboard = async () => {
    try {
      await refresh();
    } catch {
      // best-effort refresh; the session cookie already carries the partner
    }
    setLocation("/agency-dashboard");
  };

  const clearErrors = () => {
    if (fieldError) setFieldError(null);
    if (serverError) setServerError(null);
  };

  const scrollToCard = () => {
    document.getElementById("partner-start")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (emailStepDone) {
      document.getElementById("agency-name")?.focus();
    }
  }, [emailStepDone]);

  const submitEmailStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setEmailStepError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailStepError("يرجى إدخال بريد إلكتروني صالح.");
      return;
    }
    setEmailStepDone(true);
  };

  const submitRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setServerError(null);
    const trimmed = agencyName.trim();
    if (trimmed.length < AGENCY_NAME_MIN) {
      setFieldError(`اسم الوكالة يجب أن يحتوي على ${AGENCY_NAME_MIN} أحرف على الأقل.`);
      return;
    }
    if (trimmed.length > AGENCY_NAME_MAX) {
      setFieldError(`اسم الوكالة يجب ألا يتجاوز ${AGENCY_NAME_MAX} حرفاً.`);
      return;
    }
    if (!city.trim()) {
      setFieldError("يرجى إدخال مدينة الوكالة.");
      return;
    }
    if (!phone.trim()) {
      setFieldError("يرجى إدخال رقم هاتف الوكالة بالصيغة الدولية.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("يرجى إدخال بريد إلكتروني صالح.");
      return;
    }
    if (password.length < PARTNER_PASSWORD_MIN) {
      setFieldError(`كلمة المرور يجب أن تحتوي على ${PARTNER_PASSWORD_MIN} أحرف على الأقل.`);
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await callPartnerAuth<PartnerSession>("/api/auth/partner/register", {
        agencyName: trimmed,
        city: city.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
      });
      toast.success("تم إنشاء حساب الشريك — مرحباً بك!");
      await goToDashboard();
    } catch (error) {
      const message = formatApiError(error, "تعذر إتمام التسجيل. حاول مرة أخرى أو تواصل مع الدعم.");
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setServerError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("يرجى إدخال بريد إلكتروني صالح.");
      return;
    }
    if (!password) {
      setFieldError("يرجى إدخال كلمة المرور.");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await callPartnerAuth<PartnerSession>("/api/auth/partner/login", {
        email: email.trim(),
        password,
      });
      toast.success("تم تسجيل الدخول — مرحباً بك!");
      await goToDashboard();
    } catch (error) {
      const message = formatApiError(error, "تعذر تسجيل الدخول. حاول مرة أخرى.");
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const card = "mx-auto mt-6 max-w-md space-y-4 rounded-2xl border bg-card p-6 text-start shadow-sm";

  return (
    <div className="container py-10 sm:py-16" dir="rtl">
      {loading ? (
        <p className="py-24 text-center text-sm font-semibold text-muted-foreground">جاري التحقق من الحساب...</p>
      ) : isPrivileged ? (
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-sm font-bold text-[var(--brand-amber)]">
            <ShieldCheck className="h-5 w-5" />
            <span>ALTUSplace — التسجيل كوكالة</span>
          </div>
          <h1 className="text-3xl font-black sm:text-4xl">{t("partnerJoinTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("partnerJoinSubtitle")}</p>
          <div className={card}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-bold">حسابك مسجل بالفعل كوكالة أو مشرف.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user?.agencyName ? `الوكالة: ${user.agencyName}` : "يمكنك إدارة عروضك وحجوزاتك من لوحة الوكالة."}
                </p>
              </div>
            </div>
            <Link href="/agency-dashboard">
              <Button className="w-full bg-[var(--brand-amber)] text-white">{t("partnerGoToDashboard")}</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl">
          <section className="grid items-start gap-10 lg:grid-cols-2">
            <div className="pt-2">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-black text-[var(--brand-amber)] shadow-sm">
                <Sparkles className="h-4 w-4" />
                <span>ALTUSplace — فضاء الشركاء</span>
              </div>
              <h1 className="text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{t("partnerJoinTitle")}</h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("partnerJoinSubtitle")}</p>

              <ul className="mt-7 space-y-3">
                {[
                  "آلاف الباحثين عن كراء السيارات والعقارات يطّلعون على إعلانك",
                  "تحكم فوري في الحجوزات والتوفر والأسعار من لوحة واحدة",
                  "سحوبات مالية آمنة إلى حسابك البنكي أو Cash Plus أو وفاكاش",
                  "فحص صور تلقائي لمصداقية إعلاناتك وثقة أعلى لدى العملاء",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-semibold text-foreground">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-amber)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button onClick={() => { setMode("register"); clearErrors(); setEmailStepDone(false); setEmailStepError(null); scrollToCard(); }} className="gap-2 bg-[var(--brand-amber)] text-white">
                  ابدأ الآن
                </Button>
                <Button variant="outline" onClick={() => { setMode("login"); clearErrors(); scrollToCard(); }}>
                  تابع عملية التسجيل
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-[var(--brand-amber)]" />آلاف العملاء يومياً</span>
                <span className="inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-[var(--brand-amber)]" />حجز مباشر وإدارة فورية</span>
                <span className="inline-flex items-center gap-2"><Banknote className="h-4 w-4 text-[var(--brand-amber)]" />سحوبات منتظمة</span>
              </div>
            </div>

            <div id="partner-start" className="scroll-mt-24 rounded-3xl bg-[var(--brand-navy)] p-5 text-white shadow-2xl sm:p-7">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
                <p className="text-xs font-black tracking-wide text-[var(--brand-amber)]">ALTUSplace — التسجيل كوكالة</p>
                <h2 className="mt-2 text-xl font-black leading-relaxed">وجّه مكاتبك نحو آلاف الزبائن واربح من أول إعلان.</h2>
                <div className="mt-4 h-1 w-14 rounded-full bg-[var(--brand-amber)]" />
              </div>

              <div role="tablist" aria-label={t("partnerJoinTitle")} className="mx-auto mt-6 inline-flex rounded-full border bg-card p-1 shadow-sm">
                <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); clearErrors(); setEmailStepDone(false); }} className={`rounded-full px-5 py-2 text-sm font-bold transition ${mode === "register" ? "bg-[var(--brand-amber)] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}>{t("partnerRegisterNew")}</button>
                <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); clearErrors(); }} className={`rounded-full px-5 py-2 text-sm font-bold transition ${mode === "login" ? "bg-[var(--brand-amber)] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}>{t("partnerExistingLogin")}</button>
              </div>

              {mode === "register" ? (
                emailStepDone ? (
                  <form className={card} onSubmit={submitRegister} noValidate>
                    <div className="flex items-center gap-2 font-bold">
                      <Building2 className="h-4 w-4 text-[var(--brand-amber)]" />
                      <span>بيانات الوكالة</span>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="agency-name" className="block text-sm font-semibold">اسم الوكالة / الشركة</label>
                      <input
                        id="agency-name"
                        className="w-full rounded-xl border bg-background p-3 text-center"
                        placeholder="اسم الوكالة / الشركة"
                        value={agencyName}
                        minLength={AGENCY_NAME_MIN}
                        maxLength={AGENCY_NAME_MAX}
                        required
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={fieldError ? "agency-name-error" : undefined}
                        onChange={(event) => { setAgencyName(event.target.value); clearErrors(); }}
                      />
                      {fieldError ? (
                        <p id="agency-name-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">{fieldError}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">من {AGENCY_NAME_MIN} إلى {AGENCY_NAME_MAX} حرفاً.</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="agency-city" className="block text-sm font-semibold">المدينة</label>
                      <input
                        id="agency-city"
                        className="w-full rounded-xl border bg-background p-3 text-center"
                        placeholder="مثال: الدار البيضاء"
                        value={city}
                        maxLength={120}
                        required
                        onChange={(event) => { setCity(event.target.value); clearErrors(); }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="agency-phone" className="block text-sm font-semibold">رقم الهاتف <span className="font-normal text-muted-foreground">(بالصيغة الدولية)</span></label>
                      <input
                        id="agency-phone"
                        className="w-full rounded-xl border bg-background p-3 text-center"
                        placeholder="مثال: +212612345678"
                        value={phone}
                        maxLength={32}
                        required
                        onChange={(event) => { setPhone(event.target.value); clearErrors(); }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="agency-email" className="block text-sm font-semibold">البريد الإلكتروني</label>
                      <input
                        id="agency-email"
                        type="email"
                        className="w-full rounded-xl border bg-background p-3 text-center"
                        placeholder="agency@example.com"
                        value={email}
                        maxLength={320}
                        required
                        onChange={(event) => { setEmail(event.target.value); clearErrors(); }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="agency-password" className="block text-sm font-semibold">كلمة المرور</label>
                      <input
                        id="agency-password"
                        type="password"
                        className="w-full rounded-xl border bg-background p-3 text-center"
                        placeholder={`${PARTNER_PASSWORD_MIN} أحرف على الأقل`}
                        value={password}
                        minLength={PARTNER_PASSWORD_MIN}
                        required
                        onChange={(event) => { setPassword(event.target.value); clearErrors(); }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="agency-password-confirm" className="block text-sm font-semibold">تأكيد كلمة المرور</label>
                      <input
                        id="agency-password-confirm"
                        type="password"
                        className="w-full rounded-xl border bg-background p-3 text-center"
                        placeholder="أعد كتابة كلمة المرور"
                        value={confirmPassword}
                        minLength={PARTNER_PASSWORD_MIN}
                        required
                        onChange={(event) => { setConfirmPassword(event.target.value); clearErrors(); }}
                      />
                    </div>
                    {serverError ? (
                      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{serverError}</p>
                    ) : null}
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "جاري التسجيل..." : "التسجيل كوكالة تأجير"}
                    </Button>
                  </form>
                ) : (
                  <div className={card}>
                    <div className="flex items-center gap-2 font-bold">
                      <Mail className="h-4 w-4 text-[var(--brand-amber)]" />
                      <span>ابدأ ببريدك الإلكتروني</span>
                    </div>
                    <p className="text-sm text-muted-foreground">أدخل عنوان بريدك الإلكتروني ثم اضغط «متابعة» لاستكمال إنشاء حساب وكالتك.</p>
                    <form onSubmit={submitEmailStep} noValidate>
                      <div className="space-y-1.5">
                        <label htmlFor="partner-email-entry" className="block text-sm font-semibold">عنوان البريد الإلكتروني</label>
                        <input
                          id="partner-email-entry"
                          type="email"
                          autoComplete="email"
                          className="w-full rounded-xl border bg-background p-3 text-center"
                          placeholder="agency@example.com"
                          value={email}
                          maxLength={320}
                          required
                          aria-invalid={Boolean(emailStepError)}
                          aria-describedby={emailStepError ? "partner-email-entry-error" : undefined}
                          onChange={(event) => { setEmail(event.target.value); if (emailStepError) setEmailStepError(null); }}
                        />
                        {emailStepError ? (
                          <p id="partner-email-entry-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">{emailStepError}</p>
                        ) : null}
                      </div>
                      <Button type="submit" className="w-full" disabled={submitting}>
                        <span>متابعة</span>
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    </form>
                    <button type="button" onClick={() => setMode("login")} className="w-full text-center text-xs font-bold text-[var(--brand-amber)] hover:underline">
                      لديك حساب بالفعل؟ تسجيل الدخول
                    </button>
                  </div>
                )
              ) : (
                <form className={card} onSubmit={submitLogin} noValidate>
                  <div className="flex items-center gap-2 font-bold">
                    <LogIn className="h-4 w-4 text-[var(--brand-amber)]" />
                    <span>دخول الشريك</span>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="partner-login-email" className="block text-sm font-semibold">البريد الإلكتروني</label>
                    <input
                      id="partner-login-email"
                      type="email"
                      className="w-full rounded-xl border bg-background p-3 text-center"
                      placeholder="agency@example.com"
                      value={email}
                      maxLength={320}
                      required
                      onChange={(event) => { setEmail(event.target.value); clearErrors(); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="partner-login-password" className="block text-sm font-semibold">كلمة المرور</label>
                    <input
                      id="partner-login-password"
                      type="password"
                      className="w-full rounded-xl border bg-background p-3 text-center"
                      placeholder="كلمة المرور"
                      value={password}
                      required
                      onChange={(event) => { setPassword(event.target.value); clearErrors(); }}
                    />
                  </div>
                  {serverError ? (
                    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{serverError}</p>
                  ) : null}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "جاري الدخول..." : "دخول"}
                  </Button>
                  <button type="button" onClick={() => startLogin()} className="w-full text-center text-xs font-bold text-[var(--brand-amber)] hover:underline">
                    {t("partnerExistingLogin")}
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="mt-16">
            <div className="text-center">
              <h2 className="text-2xl font-black sm:text-3xl">لماذا تصبح شريكاً مع ALTUSplace؟</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                بيئة متكاملة تحمي عروضك، تنظّم أموالك، وتُظهرك أمام أكبر عدد من الباحثين عن الكراء في المغرب.
              </p>
            </div>
            <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="rounded-3xl border bg-card p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-amber-soft)] text-[var(--brand-amber)]">
                      <benefit.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-black">{benefit.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{benefit.description}</p>
                    </div>
                  </div>
                  <ul className="mt-5 space-y-2.5">
                    {benefit.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm font-semibold">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-amber)]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Link href="/my-bookings">
              <Button variant="outline">الانتقال إلى حجوزاتي</Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                الصفحة الرئيسية
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}