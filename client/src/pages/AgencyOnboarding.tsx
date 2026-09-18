import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Building2, CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";
import { formatApiError, trpcErrorCode } from "@/lib/apiError";

const AGENCY_NAME_MIN = 2;
const AGENCY_NAME_MAX = 80;

import { useSEO } from "@/lib/seo";

export default function AgencyOnboarding() {
  useSEO({ title: "سجّل وكالتك واربح من الكراء | ALTUSplace", description: "انضم إلى ALTUSplace كمالك أو وكالة واعرض سياراتك وعقاراتك للكراء في المغرب.", path: "/become-agency", canonicalPath: "/become-agency" });
  const { t } = useLanguage();
  const { user, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [agencyName, setAgencyName] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [alreadyAgency, setAlreadyAgency] = useState(false);

  const becomeAgency = trpc.auth.becomeAgency.useMutation({
    onSuccess: async (result) => {
      utils.auth.me.setData(undefined, (current) =>
        current ? { ...current, role: result.role, agencyName: agencyName.trim() } : current,
      );
      toast.success("تم التسجيل كوكالة تأجير — مرحباً بك!");
      try {
        await refresh();
      } catch {
        // Authoritative refresh is best-effort; the optimistic role above keeps
        // the guard from bouncing the freshly registered agency.
      }
      setLocation("/agency-dashboard");
    },
    onError: (error) => {
      const message = formatApiError(error, "تعذر إتمام التسجيل. حاول مرة أخرى أو تواصل مع الدعم.");
      if (trpcErrorCode(error) === "CONFLICT") setAlreadyAgency(true);
      setServerError(message);
      toast.error(message);
    },
  });

  const isPrivileged = user?.role === "owner" || user?.role === "admin" || user?.role === "SUPER_ADMIN";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (becomeAgency.isPending) return;
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
    setFieldError(null);
    becomeAgency.mutate({
      agencyName: trimmed,
      commercialRegister: commercialRegister.trim() || undefined,
    });
  };

  const card = "mx-auto mt-6 max-w-md space-y-4 rounded-2xl border bg-card p-6 text-start shadow-sm";

  return (
    <div className="container py-16 sm:py-24" dir="rtl">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-bold text-[var(--brand-amber)]">
          <ShieldCheck className="h-5 w-5" />
          <span>ALTUSplace — التسجيل كوكالة</span>
        </div>
        <h1 className="text-3xl font-black sm:text-4xl">{t("partnerJoinTitle")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("partnerJoinSubtitle")}</p>

        {loading ? (
          <p className="mt-10 text-sm font-semibold text-muted-foreground">جاري التحقق من الحساب...</p>
        ) : !user ? (
          <div className={card}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              سجّل الدخول أولاً ثم أكمل بيانات وكالتك. سيتم ربط الوكالة بحسابك تلقائياً.
            </p>
            <Button type="button" onClick={() => startLogin()} className="w-full gap-2 bg-[var(--brand-amber)] text-white">
              <LogIn className="h-4 w-4" />
              تسجيل الدخول
            </Button>
          </div>
        ) : alreadyAgency || isPrivileged ? (
          <div className={card}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-bold">حسابك مسجل بالفعل كوكالة أو مشرف.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user.agencyName ? `الوكالة: ${user.agencyName}` : "يمكنك إدارة عروضك وحجوزاتك من لوحة الوكالة."}
                </p>
              </div>
            </div>
            <Link href="/agency-dashboard">
              <Button className="w-full bg-[var(--brand-amber)] text-white">{t("partnerGoToDashboard")}</Button>
            </Link>
          </div>
        ) : (
          <>
            <div role="tablist" aria-label={t("partnerJoinTitle")} className="mx-auto mt-8 inline-flex rounded-full border bg-card p-1 shadow-sm">
              <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setServerError(null); }} className={`rounded-full px-5 py-2 text-sm font-bold transition ${mode === "register" ? "bg-[var(--brand-amber)] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}>{t("partnerRegisterNew")}</button>
              <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setServerError(null); }} className={`rounded-full px-5 py-2 text-sm font-bold transition ${mode === "login" ? "bg-[var(--brand-amber)] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}>{t("partnerExistingLogin")}</button>
            </div>

            {mode === "register" ? (
              <form className={card} onSubmit={submit} noValidate>
                <div className="flex items-center gap-2 font-bold">
                  <Building2 className="h-4 w-4 text-[var(--brand-amber)]" />
                  <span>بيانات الوكالة</span>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="agency-name" className="block text-sm font-semibold">
                    اسم الوكالة / الشركة
                  </label>
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
                    onChange={(event) => {
                      setAgencyName(event.target.value);
                      if (fieldError) setFieldError(null);
                      if (serverError) setServerError(null);
                    }}
                  />
                  {fieldError ? (
                    <p id="agency-name-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">
                      {fieldError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">من {AGENCY_NAME_MIN} إلى {AGENCY_NAME_MAX} حرفاً.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="agency-register" className="block text-sm font-semibold">
                    السجل التجاري <span className="font-normal text-muted-foreground">(اختياري)</span>
                  </label>
                  <input
                    id="agency-register"
                    className="w-full rounded-xl border bg-background p-3 text-center"
                    placeholder="رقم السجل التجاري"
                    value={commercialRegister}
                    maxLength={120}
                    onChange={(event) => setCommercialRegister(event.target.value)}
                  />
                </div>
                {serverError ? (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {serverError}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={becomeAgency.isPending}>
                  {becomeAgency.isPending ? "جاري التسجيل..." : "التسجيل كوكالة تأجير"}
                </Button>
                <p className="text-xs text-muted-foreground">بعد التسجيل يتحول حسابك إلى حساب مالك: تظهر لك سياراتك وحجوزاتك فقط، ولا يطلع أي وكالة أخرى على بياناتك.</p>
              </form>
            ) : (
              <div className={card}>
                <p className="text-sm leading-relaxed text-muted-foreground">{t("partnerExistingDesc")}</p>
                <Link href="/agency-dashboard">
                  <Button className="w-full bg-[var(--brand-amber)] text-white">{t("partnerGoToDashboard")}</Button>
                </Link>
                <button type="button" onClick={() => startLogin()} className="w-full text-center text-xs font-bold text-[var(--brand-amber)] hover:underline">
                  {t("partnerExistingLogin")}
                </button>
              </div>
            )}
          </>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
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
  );
}
