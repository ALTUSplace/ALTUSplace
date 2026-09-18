import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

type Mode = "loading" | "login" | "setup" | "unavailable";

/** Parse JSON only when the API actually returned JSON (never the SPA HTML). */
async function readJson(response: Response): Promise<{ configured?: boolean; reason?: string; redirectTo?: string } | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    return (await response.json()) as { configured?: boolean; reason?: string; redirectTo?: string };
  } catch {
    return null;
  }
}

import { useSEO } from "@/lib/seo";

export default function DirectLogin() {
  useSEO({ title: "تسجيل الدخول المباشر | ALTUSplace", description: "صفحة دخول مخصصة لشركاء ALTUSplace.", path: "/direct-login", robots: "noindex, follow" });
  const { direction, language } = useLanguage();
  const [mode, setMode] = useState<Mode>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const str = (key: string): string => {
    const t: Record<string, Record<string, string>> = {
      ar: {
        title: "ALTUSplace — مالك المنصة",
        headingSetup: "إنشاء حساب مالك المنصة",
        headingLogin: "تسجيل الدخول المباشر",
        setupDesc: "لم يتم تحديد كلمة مرور لمالك المنصة بعد. اختر كلمة مرور الآن لتفعيل الحساب. تُخزَّن كلمة المرور في قاعدة البيانات فقط — ولا تُحفظ أبداً في المستودع — ولا يمكن تحديدها إلا مرة واحدة.",
        loginDesc: "دخول احتياطي لمالك المنصة عند تعذّر الوصول إلى بوابة المصادقة الخارجية.",
        checking: "جاري التحقق من حالة دخول المالك…",
        unreachable: "تعذّر الاتصال بالخادم. يرجى تحديث الصفحة وإعادة المحاولة.",
        passwordShort: "اختر كلمة مرور مكوّنة من 8 أحرف على الأقل.",
        passwordMismatch: "كلمتا المرور غير متطابقتين.",
        alreadyConfigured: "تم تحديد كلمة المرور مسبقاً. يرجى تسجيل الدخول.",
        tooManyAttempts: "محاولات كثيرة. يرجى الانتظار دقيقة ثم إعادة المحاولة.",
        weakPassword: "اختر كلمة مرور مكوّنة من 8 أحرف على الأقل.",
        missingPassword: "لم يستقبل الخادم كلمة المرور. يرجى إعادة المحاولة.",
        serverError: "خطأ في الخادم. راجع سجلات Vercel الوظيفية للبحث عن [DirectAuth].",
        notConfigured: "لم يتم تحديد كلمة مرور بعد. اختر واحدة لتفعيل هذا الحساب.",
        passwordMismatchLogin: "كلمة المرور غير صحيحة. يرجى إعادة المحاولة.",
        genericError: "حدث خطأ ما. يرجى إعادة المحاولة.",
        networkError: "خطأ في الشبكة. يرجى إعادة المحاولة.",
        newPasswordLabel: "كلمة المرور الجديدة",
        passwordLabel: "كلمة المرور",
        confirmLabel: "تأكيد كلمة المرور",
        settingUp: "جاري الإعداد…",
        signingIn: "جاري تسجيل الدخول…",
        setupButton: "تحديد كلمة المرور وتسجيل الدخول",
        signInButton: "تسجيل الدخول",
        back: "رجوع",
      },
      fr: {
        title: "ALTUSplace — Propriétaire de la plateforme",
        headingSetup: "Créer le compte propriétaire",
        headingLogin: "Connexion directe",
        setupDesc: "Aucun mot de passe propriétaire n'est défini. Choisissez-en un maintenant pour activer le compte. Il est stocké uniquement en base de données — jamais dans le dépôt — et ne peut être défini qu'une fois.",
        loginDesc: "Accès de secours pour le propriétaire de la plateforme lorsque le portail OAuth externe est indisponible.",
        checking: "Vérification de l'état de connexion…",
        unreachable: "Impossible de joindre le serveur. Actualisez la page et réessayez.",
        passwordShort: "Choisissez un mot de passe d'au moins 8 caractères.",
        passwordMismatch: "Les deux mots de passe ne correspondent pas.",
        alreadyConfigured: "Ce mot de passe a déjà été défini. Connectez-vous.",
        tooManyAttempts: "Trop de tentatives. Attendez une minute puis réessayez.",
        weakPassword: "Choisissez un mot de passe d'au moins 8 caractères.",
        missingPassword: "Le serveur n'a pas reçu le mot de passe. Réessayez.",
        serverError: "Erreur serveur. Consultez les journaux Vercel pour [DirectAuth].",
        notConfigured: "Aucun mot de passe défini. Choisissez-en un pour activer ce compte.",
        passwordMismatchLogin: "Mot de passe incorrect. Réessayez.",
        genericError: "Une erreur est survenue. Réessayez.",
        networkError: "Erreur réseau. Réessayez.",
        newPasswordLabel: "Nouveau mot de passe",
        passwordLabel: "Mot de passe",
        confirmLabel: "Confirmer le mot de passe",
        settingUp: "Configuration…",
        signingIn: "Connexion…",
        setupButton: "Définir le mot de passe et se connecter",
        signInButton: "Se connecter",
        back: "Retour",
      },
      en: {
        title: "ALTUSplace — Platform Owner",
        headingSetup: "Set up owner login",
        headingLogin: "Direct login",
        setupDesc: "No owner password is set yet. Choose one now to claim the platform-owner account. It is stored only in the database — never in the repository — and can be set just once here.",
        loginDesc: "Fallback access for the platform owner when the external OAuth portal is unavailable.",
        checking: "Checking owner login status…",
        unreachable: "Could not reach the server. Please refresh the page and try again.",
        passwordShort: "Choose a password with at least 8 characters.",
        passwordMismatch: "The two passwords do not match.",
        alreadyConfigured: "This owner login has already been set up. Please sign in.",
        tooManyAttempts: "Too many attempts. Please wait a minute and try again.",
        weakPassword: "Choose a password with at least 8 characters.",
        missingPassword: "The server did not receive the password. Please try again.",
        serverError: "Server error. Check the Vercel function logs for [DirectAuth].",
        notConfigured: "No owner password is set yet. Choose one to claim this account.",
        passwordMismatchLogin: "Incorrect password. Please try again.",
        genericError: "Something went wrong. Please try again.",
        networkError: "Network error. Please try again.",
        newPasswordLabel: "New owner password",
        passwordLabel: "Owner password",
        confirmLabel: "Confirm password",
        settingUp: "Setting up…",
        signingIn: "Signing in…",
        setupButton: "Set password & sign in",
        signInButton: "Sign in",
        back: "Back",
      },
    };
    const lang = (["ar", "fr", "en"] as const).includes(language as "ar" | "fr" | "en") ? (language as "ar" | "fr" | "en") : "ar";
    return t[lang][key] ?? t.ar[key] ?? key;
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/owner-status", { credentials: "include" })
      .then(async (response) => {
        if (cancelled) return;
        const data = await readJson(response);
        if (!data) {
          setMode("unavailable");
          setError(str("unreachable"));
          return;
        }
        setMode(data.configured ? "login" : "setup");
      })
      .catch(() => {
        if (!cancelled) {
          setMode("unavailable");
          setError(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const endpoint = mode === "setup" ? "/api/auth/owner-setup" : "/api/auth/direct-login";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (mode === "setup") {
      if (password.length < 8) {
        setError(str("passwordShort"));
        return;
      }
      if (password !== confirm) {
        setError(str("passwordMismatch"));
        return;
      }
    } else if (!password) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Redundant channel: serverless runtimes pre-parse the body, and the
          // header survives independently of body parsing.
          "x-owner-password": password,
        },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const payload = await readJson(response);
      if (!payload) {
        setError(str("unreachable"));
        return;
      }
      if (response.ok) {
        window.location.href = payload.redirectTo || "/admin/super/dashboard";
        return;
      }
      const reason = payload.reason;
      if (reason === "already_configured") {
        setMode("login");
        setError(str("alreadyConfigured"));
      } else if (response.status === 429) {
        setError(str("tooManyAttempts"));
      } else if (reason === "weak_password") {
        setError(str("weakPassword"));
      } else if (reason === "missing_password") {
        setError(str("missingPassword"));
      } else if (reason === "server_error") {
        setError(str("serverError"));
      } else if (reason === "not_configured") {
        setMode("setup");
        setError(str("notConfigured"));
      } else if (reason === "password_mismatch") {
        setError(str("passwordMismatchLogin"));
      } else {
        setError(str("genericError"));
      }
    } catch {
      setError(str("networkError"));
    } finally {
      setLoading(false);
    }
  };

  const isSetup = mode === "setup";
  const canSubmit = mode === "loading" || mode === "unavailable" ? false : isSetup ? Boolean(password && confirm) : Boolean(password);

  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:px-6" dir={direction}>
      <section className="mx-auto max-w-md">
        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
            <ShieldCheck className="h-5 w-5" />
            <span>{str("title")}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-950">{isSetup ? str("headingSetup") : str("headingLogin")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {isSetup ? str("setupDesc") : str("loginDesc")}
          </p>

          {mode === "loading" ? (
            <p className="mt-6 text-sm font-semibold text-slate-500">{str("checking")}</p>
          ) : mode === "unavailable" ? (
            error ? null : (
              <p className="mt-6 text-sm font-semibold text-slate-500">
                {str("unreachable")}
              </p>
            )
          ) : (
            <>
              <label htmlFor="direct-password" className="mt-6 block text-sm font-semibold text-slate-800">
                {isSetup ? str("newPasswordLabel") : str("passwordLabel")}
              </label>
              <input
                id="direct-password"
                type="password"
                autoComplete={isSetup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                placeholder="••••••••"
              />

              {isSetup ? (
                <>
                  <label htmlFor="direct-password-confirm" className="mt-4 block text-sm font-semibold text-slate-800">
                    {str("confirmLabel")}
                  </label>
                  <input
                    id="direct-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                    placeholder="••••••••"
                  />
                </>
              ) : null}
            </>
          )}

          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          {mode !== "loading" && mode !== "unavailable" ? (
            <Button type="submit" disabled={!canSubmit || loading} className="mt-5 w-full gap-2 bg-[#1C1C1E] text-white hover:bg-accent-clay-hover">
              <KeyRound className="h-4 w-4" />
              {loading ? (isSetup ? str("settingUp") : str("signingIn")) : isSetup ? str("setupButton") : str("signInButton")}
            </Button>
          ) : null}
        </form>

        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#1C1C1E] hover:text-amber-700">
          <ArrowLeft className="h-4 w-4" />
          {str("back")}
        </Link>
      </section>
    </main>
  );
}