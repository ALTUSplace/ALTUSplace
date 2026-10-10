import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { startOwnerLogin } from "@/const";
import { legalDisclosure, persistLegalConsent, LEGAL_CONSENT_VERSION } from "@/lib/legalDisclosure";
import { trackEvent } from "@/lib/analytics";

import { useSEO } from "@/lib/seo";

type RegisterPayload = { reason?: string; redirectTo?: string };

/** Parse JSON only when the API actually returned JSON (never the SPA HTML). */
async function readJson(response: Response): Promise<RegisterPayload | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    return (await response.json()) as RegisterPayload;
  } catch {
    return null;
  }
}

export default function Register() {
  useSEO({ title: "إنشاء حساب | ALTUSplace", description: "أنشئ حسابك على ALTUSplace لكراء السيارات والعقارات في المغرب.", path: "/register", robots: "noindex, follow" });
  const { language, direction, t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const content = legalDisclosure[language];

  const str = (key: string): string => {
    const tMap: Record<string, Record<string, string>> = {
      ar: {
        title: "إنشاء حساب",
        desc: "أنشئ حسابك كرئيس — لا حاجة إلى رقم الهاتف. تُخزَّن كلمة المرور في قاعدة البيانات فقط.",
        nameLabel: "الاسم الكامل",
        emailLabel: "البريد الإلكتروني",
        passwordLabel: "كلمة المرور",
        passwordHint: "8 أحرف على الأقل.",
        signingUp: "جارٍ إنشاء الحساب…",
        submit: "إنشاء الحساب",
        emailTaken: "هذا البريد الإلكتروني مسجل بالفعل. سجّل الدخول أو استخدم بريداً آخر.",
        unreachable: "تعذّر الاتصال بالخادم. يرجى تحديث الصفحة وإعادة المحاولة.",
        genericError: "حدث خطأ ما. حاول مرة أخرى.",
        networkError: "خطأ في الشبكة. حاول مرة أخرى.",
        ownerLogin: "دخول المالكين والشركاء",
        login: "لديك حساب؟ سجّل الدخول",
        back: "العودة إلى الرئيسية",
      },
      fr: {
        title: "Créer un compte",
        desc: "Créez votre compte locataire — aucun numéro de téléphone requis. Le mot de passe n'est stocké que dans la base de données.",
        nameLabel: "Nom complet",
        emailLabel: "E-mail",
        passwordLabel: "Mot de passe",
        passwordHint: "8 caractères minimum.",
        signingUp: "Création du compte…",
        submit: "Créer le compte",
        emailTaken: "Cet e-mail est déjà utilisé. Connectez-vous ou utilisez une autre adresse.",
        unreachable: "Impossible de joindre le serveur. Actualisez la page.",
        genericError: "Une erreur est survenue. Réessayez.",
        networkError: "Erreur réseau. Réessayez.",
        ownerLogin: "Connexion propriétaires et partenaires",
        login: "Déjà un compte ? Se connecter",
        back: "Retour à l'accueil",
      },
      en: {
        title: "Create account",
        desc: "Create your renter account — no phone number required. Your password is stored only in the database.",
        nameLabel: "Full name",
        emailLabel: "Email",
        passwordLabel: "Password",
        passwordHint: "At least 8 characters.",
        signingUp: "Creating account…",
        submit: "Create account",
        emailTaken: "This email is already registered. Sign in or use another address.",
        unreachable: "Could not reach the server. Please refresh the page and try again.",
        genericError: "Something went wrong. Please try again.",
        networkError: "Network error. Please try again.",
        ownerLogin: "Owner & partner login",
        login: "Already have an account? Sign in",
        back: "Back to home",
      },
    };
    const lang = (["ar", "fr", "en"] as const).includes(language as "ar" | "fr" | "en") ? (language as "ar" | "fr" | "en") : "ar";
    return tMap[lang][key] ?? tMap.ar[key] ?? key;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!accepted) {
      setError(str("genericError"));
      return;
    }
    if (password.length < 8) {
      setError(str("passwordHint"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/renter/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, email, password, legalConsentVersion: LEGAL_CONSENT_VERSION }),
      });
      const payload = await readJson(response);
      if (!payload) {
        setError(str("unreachable"));
        return;
      }
      if (response.ok) {
        persistLegalConsent();
        trackEvent("signup_completed", { method: "password" });
        window.location.href = payload.redirectTo || "/";
        return;
      }
      if (response.status === 429) {
        setError(str("genericError"));
        return;
      }
      const reason = payload.reason;
      if (reason === "email_taken") {
        setError(str("emailTaken"));
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
      <section className="mx-auto max-w-lg space-y-6">
        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-label={str("title")}>
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
              <UserRound className="h-5 w-5" />
              <span>{content.title}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{str("title")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{str("desc")}</p>

            <label htmlFor="register-name" className="mt-6 block text-sm font-semibold text-slate-800">
              {str("nameLabel")}
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />

            <label htmlFor="register-email" className="mt-4 block text-sm font-semibold text-slate-800">
              {str("emailLabel")}
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              placeholder="you@example.com"
            />

            <label htmlFor="register-password" className="mt-4 block text-sm font-semibold text-slate-800">
              {str("passwordLabel")}
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-slate-500">{str("passwordHint")}</p>
          </div>

          <div className="mt-8 space-y-4">
            {content.sections.map((section) => (
              <article key={section.title} className="border-s-4 border-amber-400 bg-amber-50/60 p-4 text-sm leading-7 text-slate-700">
                <h2 className="font-black text-slate-900">{section.title}</h2>
                <p className="mt-1">{section.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Checkbox id="legal-consent" checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-1" />
            <label htmlFor="legal-consent" className="cursor-pointer text-sm font-semibold leading-6 text-slate-800">
              {t("identityVerification")}
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" dir="rtl">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={loading || !accepted} className="mt-5 w-full gap-2 bg-emerald-700 dark:bg-[#047857] text-white hover:bg-emerald-800 dark:hover:bg-[#065F46]">
            <CheckCircle2 className="h-4 w-4" />
            {loading ? str("signingUp") : str("submit")}
          </Button>

          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            <Link href="/login" className="text-sm font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300">
              {str("login")}
            </Link>
            <button type="button" onClick={() => startOwnerLogin()} className="text-sm font-semibold text-[#1C1C1E] dark:text-[#A8ABB2] hover:text-amber-700 dark:hover:text-[#F2B441]">
              {str("ownerLogin")}
            </button>
            <button type="button" onClick={() => window.location.assign("/terms")} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
              <FileText className="h-3.5 w-3.5" />
              {t("detailsAndBooking")}
            </button>
          </div>
        </form>

        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#1C1C1E] dark:text-[#A8ABB2] hover:text-amber-700 dark:hover:text-[#F2B441]">
          <ArrowLeft className="h-4 w-4" />
          {str("back")}
        </Link>
      </section>
    </div>
  );
}
