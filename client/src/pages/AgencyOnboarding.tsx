import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";
import { formatApiError } from "@/lib/apiError";
import { useSEO } from "@/lib/seo";
import { normalizeWaNumber } from "@/lib/whatsapp";

const AGENCY_NAME_MIN = 2;
const AGENCY_NAME_MAX = 80;
const PARTNER_PASSWORD_MIN = 8;

const heroBullets = [
  "يحصل 45% من المضيفين على حجزهم الأول خلال أسبوع",
  "اختر الحجز الفوري أو طلب إجراء الحجز",
  "سهل عمليات الدفع بالنيابة عنك",
];

const benefits = [
  {
    icon: ShieldCheck,
    title: "حفظ على حمايتك",
    label: "Safety & Protection",
    description: "حماية صلبة لعروضك تغطي السيارات والعقارات دون نفقات إضافية.",
    points: [
      "الحماية من المسؤولية بمبلغ يصل إلى 1,000,000 $ / € / £ دون أي تكلفة إضافية",
      "خيار إضافي للحماية من الأضرار",
      "تقليل المخاطر لكل إعلان تنشره",
    ],
  },
  {
    icon: WalletCards,
    title: "تحكم في أمورك المالية من خلال خدمة «المدفوعات»",
    label: "Financial Control",
    description: "إدارة كاملة لأموالك من لوحة واحدة مع سحوبات مرنة.",
    points: [
      "دفعات يومية متاحة في أسواق محددة",
      "حلول شاملة للملكيات المتعددة في مكان واحد",
      "تقليل المخاطر والامتثال للمعايير المالية",
    ],
  },
  {
    icon: TrendingUp,
    title: "تميز في السوق",
    label: "Market Visibility",
    description: "أكبر انتشار ممكن للعروض مدعوم بالثقة والتميز.",
    points: [
      "انقل تقييماتك السابقة إلى عروضك الجديدة",
      "شارة «جديد» لتمييز إعلاناتك الأولى",
      "وصول عالمي إلى 43 لغة و195 دولة وإقليماً",
    ],
  },
] as const;

/**
 * Self-service partner auth. Both endpoints mint the same `app_session_id`
 * cookie the rest of the platform uses, so refresh() below picks up the new
 * partner session immediately.
 *
 * The request is watchdogged with AbortController so a stalled network call
 * can never leave the submit button stuck mid-flight: after ~20s it aborts and
 * surfaces the timeout message through the callers' catch/finally.
 */
async function callPartnerAuth<T>(path: string, body: unknown): Promise<T> {
  const timeoutMs = 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("انتهت مهلة العملية — تحقق من اتصالك بالإنترنت وحاول مجدداً.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
  const [whatsappNumber, setWhatsappNumber] = useState("");
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
    if (whatsappNumber.trim() && normalizeWaNumber(whatsappNumber.trim()) === null) {
      setFieldError("رقم الواتساب غير صالح - أدخل 06XXXXXXXX أو +2126XXXXXXXX.");
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
        whatsappNumber: whatsappNumber.trim() || undefined,
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
    <div dir="rtl">
      {loading ? (
        <p className="py-24 text-center text-sm font-semibold text-muted-foreground">جاري التحقق من الحساب...</p>
      ) : isPrivileged ? (
        <div className="container py-16">
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
        </div>
      ) : (
        <div>
          <div className="bg-brand-panel text-brand-panel-ink">
            <div className="relative overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
              <div aria-hidden className="pointer-events-none absolute -bottom-16 left-10 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
              <div className="container relative py-12 sm:py-16 lg:py-20">
                <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-black text-amber-300">
                      <Sparkles className="h-4 w-4" />
                      ALTUSplace — فضاء الشركاء
                    </span>
                    <h1 className="mt-5 text-3xl font-black leading-tight sm:text-4xl lg:text-[2.75rem]">سجل عقارك مجاناً</h1>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
                      انضم إلى ALTUSplace واعرض سياراتك وعقاراتك للكراء أمام آلاف الباحثين في المغرب — بدون رسوم إدراج.
                    </p>
                    <ul className="mt-6 space-y-3">
                      {heroBullets.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                          <span className="text-sm font-semibold text-white sm:text-base">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                      <Button onClick={() => { setMode("register"); clearErrors(); setEmailStepDone(false); setEmailStepError(null); scrollToCard(); }} className="gap-2 bg-[var(--brand-amber)] text-white">
                        ابدأ الآن
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <button type="button" onClick={() => { setMode("login"); clearErrors(); scrollToCard(); }} className="text-sm font-bold text-white/90 underline decoration-white/40 underline-offset-4 transition hover:text-white">
                        قمت ببدء عملية التسجيل مسبقاً؟ تابع عملية تسجيلك
                      </button>
                    </div>
                  </div>

                  <div id="partner-start" className="scroll-mt-24 rounded-2xl bg-card p-6 text-foreground shadow-2xl ring-1 ring-black/5 sm:p-8">
                    <div className="mb-5 h-1.5 w-16 rounded-full bg-brand-panel" />
                    <div role="tablist" aria-label={t("partnerJoinTitle")} className="mx-auto inline-flex rounded-full border bg-muted/60 p-1 shadow-sm">
                      <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); clearErrors(); setEmailStepDone(false); }} className={`rounded-full px-5 py-2 text-sm font-bold transition ${mode === "register" ? "bg-brand-panel text-brand-panel-ink shadow" : "text-muted-foreground hover:text-foreground"}`}>{t("partnerRegisterNew")}</button>
                      <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); clearErrors(); }} className={`rounded-full px-5 py-2 text-sm font-bold transition ${mode === "login" ? "bg-brand-panel text-brand-panel-ink shadow" : "text-muted-foreground hover:text-foreground"}`}>{t("partnerExistingLogin")}</button>
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
                            <label htmlFor="agency-whatsapp" className="block text-sm font-semibold">رقم الواتساب <span className="font-normal text-muted-foreground">(اختياري — للتواصل المباشر مع زبنائك)</span></label>
                            <input
                              id="agency-whatsapp"
                              className="w-full rounded-xl border bg-background p-3 text-center"
                              placeholder="مثال: 06XXXXXXXX أو +2126XXXXXXXX"
                              value={whatsappNumber}
                              maxLength={32}
                              dir="ltr"
                              onChange={(event) => { setWhatsappNumber(event.target.value); clearErrors(); }}
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
                            {submitting ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري التسجيل...</> : "التسجيل كوكالة تأجير"}
                          </Button>
                        </form>
                      ) : (
                        <div className="space-y-4 pt-2">
                          <div className="text-start">
                            <h3 className="text-lg font-black text-foreground">أنشئ حساب الشريك الخاص بك</h3>
                            <p className="mt-1 text-sm text-muted-foreground">أدخل عنوان بريدك الإلكتروني لاستكمال التسجيل مجاناً — لا حاجة لبطاقة ائتمانية.</p>
                          </div>
                          <form onSubmit={submitEmailStep} noValidate>
                            <div className="space-y-1.5">
                              <label htmlFor="partner-email-entry" className="block text-sm font-semibold text-foreground">عنوان البريد الإلكتروني</label>
                              <input
                                id="partner-email-entry"
                                type="email"
                                autoComplete="email"
                                className="w-full rounded-xl border bg-background p-3 text-center focus:border-brand-panel focus:outline-none focus:ring-2 focus:ring-brand-panel/20"
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
                            <Button type="submit" className="mt-4 w-full bg-[var(--brand-amber)] text-white" disabled={submitting}>
                              متابعة
                            </Button>
                          </form>
                          <div className="border-t border-border pt-4 text-center">
                            <span className="text-xs text-muted-foreground">هل لديك حساب شريك بالفعل؟ </span>
                            <button type="button" onClick={() => setMode("login")} className="text-xs font-bold text-brand-panel hover:underline">
                              تسجيل الدخول
                            </button>
                        </div>
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
                          {submitting ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الدخول...</> : "دخول"}
                        </Button>
                        <button type="button" onClick={() => startLogin()} className="w-full text-center text-xs font-bold text-brand-panel hover:underline">
                          {t("partnerExistingLogin")}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="bg-background">
            <div className="container py-14 sm:py-16">
              <div className="text-center">
                <h2 className="text-2xl font-black sm:text-3xl">لماذا تصبح شريكاً مع ALTUSplace؟</h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                  بيئة متكاملة تحمي عروضك، تنظّم أموالك، وتُظهرك أمام أكبر عدد من الباحثين عن الكراء في المغرب.
                </p>
              </div>
              <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {benefits.map((benefit) => (
                  <div key={benefit.title} className="rounded-2xl border bg-card p-6 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-panel/10 text-brand-panel">
                        <benefit.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black tracking-wide text-brand-panel">{benefit.label}</p>
                        <h3 className="font-black leading-snug text-foreground">{benefit.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{benefit.description}</p>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-2.5">
                      {benefit.points.map((point) => (
                        <li key={point} className="flex items-start gap-2 text-sm font-semibold">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="container pb-14">
            <div className="flex flex-wrap justify-center gap-3">
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
        </div>
      )}
    </div>
  );
}