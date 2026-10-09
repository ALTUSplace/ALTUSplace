import { useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { startOwnerLogin } from "@/const";

type LoginPayload = { reason?: string; redirectTo?: string };

/** Parse JSON only when the API actually returned JSON (never the SPA HTML). */
async function readJson(response: Response): Promise<LoginPayload | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    return (await response.json()) as LoginPayload;
  } catch {
    return null;
  }
}

import { useSEO } from "@/lib/seo";

export default function Login() {
  useSEO({ title: "دخول المستأجرين | ALTUSplace", description: "تسجيل الدخول إلى حسابك كمستأجر على ALTUSplace.", path: "/login", robots: "noindex, follow" });
  const { direction, language } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const str = (key: string): string => {
    const t: Record<string, Record<string, string>> = {
      ar: {
        title: "دخول المستأجرين",
        heading: "تسجيل الدخول",
        desc: "سجّل الدخول لحجز سيارتك أو عقارك ومتابعة طلباتك بسهولة.",
        emailLabel: "البريد الإلكتروني",
        passwordLabel: "كلمة المرور",
        signingIn: "جارٍ الدخول…",
        signInButton: "تسجيل الدخول",
        invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
        accountSuspended: "هذا الحساب غير نشط. تواصل مع الدعم.",
        notRenter: "هذا البريد مسجل كحساب غير مستأجر. استخدم بوابة الدخول المناسبة.",
        tooManyAttempts: "محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.",
        unreachable: "تعذّر الاتصال بالخادم. يرجى تحديث الصفحة وإعادة المحاولة.",
        genericError: "حدث خطأ ما. حاول مرة أخرى.",
        networkError: "خطأ في الشبكة. حاول مرة أخرى.",
        ownerLogin: "دخول المالكين والشركاء",
        register: "ليس لديك حساب؟ أنشئ حساباً",
        back: "العودة إلى الرئيسية",
      },
      fr: {
        title: "Connexion locataire",
        heading: "Se connecter",
        desc: "Connectez-vous pour réserver votre voiture ou votre bien et suivre vos demandes.",
        emailLabel: "E-mail",
        passwordLabel: "Mot de passe",
        signingIn: "Connexion…",
        signInButton: "Se connecter",
        invalidCredentials: "E-mail ou mot de passe incorrect.",
        accountSuspended: "Ce compte est inactif. Contactez le support.",
        notRenter: "Cet e-mail est lié à un compte non-locataire. Utilisez la bonne passerelle.",
        tooManyAttempts: "Trop de tentatives. Réessayez dans une minute.",
        unreachable: "Impossible de joindre le serveur. Actualisez la page.",
        genericError: "Une erreur est survenue. Réessayez.",
        networkError: "Erreur réseau. Réessayez.",
        ownerLogin: "Connexion propriétaires et partenaires",
        register: "Pas de compte ? Créez-en un",
        back: "Retour à l'accueil",
      },
      en: {
        title: "Renter Login",
        heading: "Sign in",
        desc: "Sign in to book your car or property and track your bookings.",
        emailLabel: "Email",
        passwordLabel: "Password",
        signingIn: "Signing in…",
        signInButton: "Sign in",
        invalidCredentials: "Incorrect email or password.",
        accountSuspended: "This account is inactive. Contact support.",
        notRenter: "This email belongs to a non-renter account. Use the correct login.",
        tooManyAttempts: "Too many attempts. Please wait a minute and try again.",
        unreachable: "Could not reach the server. Please refresh the page and try again.",
        genericError: "Something went wrong. Please try again.",
        networkError: "Network error. Please try again.",
        ownerLogin: "Owner & partner login",
        register: "No account? Create one",
        back: "Back to home",
      },
    };
    const lang = (["ar", "fr", "en"] as const).includes(language as "ar" | "fr" | "en") ? (language as "ar" | "fr" | "en") : "ar";
    return t[lang][key] ?? t.ar[key] ?? key;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!email) {
      setError(str("invalidCredentials"));
      return;
    }
    if (!password) {
      setError(str("invalidCredentials"));
      return;
    }

    setLoading(true);
    setError(null);
    let next: string | null = null;
    try {
      const rawNext = new URLSearchParams(window.location.search).get("next");
      if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")) next = rawNext;
    } catch {
      next = null;
    }
    try {
      const response = await fetch("/api/auth/renter/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password, next }),
      });
      const payload = await readJson(response);
      if (!payload) {
        setError(str("unreachable"));
        return;
      }
      if (response.ok) {
        window.location.href = payload.redirectTo || "/";
        return;
      }
      if (response.status === 429) {
        setError(str("tooManyAttempts"));
        return;
      }
      const reason = payload.reason;
      if (reason === "invalid_credentials") {
        setError(str("invalidCredentials"));
      } else if (reason === "account_suspended") {
        setError(str("accountSuspended"));
      } else if (reason === "not_renter") {
        setError(str("notRenter"));
      } else if (reason === "server_error") {
        setError(str("genericError"));
      } else {
        setError(str("genericError"));
      }
    } catch {
      setError(str("networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:px-6" dir={direction}>
      <section className="mx-auto max-w-md">
        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-label={str("heading")}>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
            <UserRound className="h-5 w-5" />
            <span>{str("title")}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-950">{str("heading")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">{str("desc")}</p>

          <label htmlFor="login-email" className="mt-6 block text-sm font-semibold text-slate-800">
            {str("emailLabel")}
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            placeholder="you@example.com"
          />

          <label htmlFor="login-password" className="mt-4 block text-sm font-semibold text-slate-800">
            {str("passwordLabel")}
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            placeholder="••••••••"
          />

          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" dir="rtl">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={loading} className="mt-5 w-full gap-2 bg-emerald-700 dark:bg-[#047857] text-white hover:bg-emerald-800 dark:hover:bg-[#065F46]">
            <KeyRound className="h-4 w-4" />
            {loading ? str("signingIn") : str("signInButton")}
          </Button>

          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            <Link href="/register" className="text-sm font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300">
              {str("register")}
            </Link>
            <button type="button" onClick={() => startOwnerLogin()} className="text-sm font-semibold text-[#1C1C1E] dark:text-[#A8ABB2] hover:text-amber-700 dark:hover:text-[#F2B441]">
              {str("ownerLogin")}
            </button>
          </div>
        </form>

        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#1C1C1E] dark:text-[#A8ABB2] hover:text-amber-700 dark:hover:text-[#F2B441]">
          <ArrowLeft className="h-4 w-4" />
          {str("back")}
        </Link>
      </section>
    </div>
  );
}