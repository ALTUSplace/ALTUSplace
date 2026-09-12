import { useEffect, useRef, useState } from "react";
import { X, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";
import { toast } from "sonner";

type View = "signin" | "signup" | "otp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: View;
  onSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, initialView = "signin", onSuccess }: AuthModalProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<View>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      window.setTimeout(() => emailRef.current?.focus(), 60);
    }
  }, [isOpen, initialView]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const prev = document.activeElement as HTMLElement | null;
    modalRef.current.focus();
    return () => prev?.focus();
  }, [isOpen]);

  const validateEmail = () => {
    if (!email.trim()) return "Email is required";
    if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address";
    return undefined;
  };

  const validatePassword = () => {
    if (view === "signin") return password.length >= 6 ? undefined : "Password must be at least 6 characters";
    return password.length >= 8 ? undefined : "Use at least 8 characters";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail();
    const passwordError = validatePassword();
    const next = { email: emailError, password: passwordError };
    setErrors(next);
    if (emailError || passwordError) return;

    setLoading(true);
    startLogin();
    window.setTimeout(() => {
      setLoading(false);
      setView("otp");
      setSentTo(email.trim());
      toast.success(t("codeSent"));
    }, 650);
  };

  const handleOtpChange = (i: number, value: string) => {
    const digits = value.replace(/[^\d]/g, "").slice(0, 1);
    setOtp((prev) => prev.map((d, idx) => (idx === i ? digits : d)).slice(0, 6).concat(Array(Math.max(0, 6 - Math.min(6, ...[])).toString.length)) );
  };

  if (!isOpen) return null;

  const socialButtonClass = "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-800 shadow-sm transition-all hover:shadow-md hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[#2563EB]/60 focus-visible:outline-none";
  const inputClass = "peer h-12 w-full rounded-xl border bg-white px-4 pt-4 text-sm text-stone-900 outline-none transition-all placeholder-transparent focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 focus-visible:ring-[#2563EB]/30";
  const labelClass = "pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400 peer-focus:text-[#2563EB]";
  const errText = "mt-1.5 text-[11px] font-medium text-rose-500";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-md" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={view === "signup" ? t("createAccount") : view === "otp" ? t("verifyCode") : t("signIn")} tabIndex={-1} className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-stone-900/5 focus:outline-none">
        <div className="flex items-center justify-between border-b border-stone-200/70 px-6 py-4">
          <h2 className="text-lg font-extrabold text-stone-900">{view === "signup" ? t("createAccount") : view === "otp" ? t("enterCode") : t("signIn")}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-6 py-6">
          {view === "otp" ? (
            <form onSubmit={(e) => { e.preventDefault(); setLoading(true); window.setTimeout(() => { setLoading(false); onSuccess?.(); onClose(); toast.success(t("welcomeBack")); }, 600); }}>
              <p className="mb-4 text-sm text-stone-500">Enter the 6-digit code we sent to <span className="font-semibold text-stone-800">{sentTo || email}</span></p>
              <div className="flex justify-between gap-2">
                {otp.map((d, i) => (
                  <input key={i} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={d} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g,""); setOtp((prev)=> prev.map((x,idx)=> idx===i ? (v.length>1 ? v[v.length-1] : v) : x)); if(v && i<5) (e.target.nextElementSibling as HTMLElement | null)?.focus(); }} className="h-14 w-full rounded-xl border border-stone-300 text-center text-lg font-bold text-stone-900 outline-none transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 min-w-0" aria-label={`Digit ${i + 1}`} />
                ))}
              </div>
              <button type="submit" disabled={loading || otp.some((d)=>!d)} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-4 w-4" /> {t("verifyAndContinue")}</>}
              </button>
              <button type="button" onClick={() => { setView(initialView); setOtp(["","","","","",""]); }} className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800"><ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("backToEmail")}</button>
            </form>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2.5">
                <button type="button" onClick={() => { startLogin(); }} className={cn(socialButtonClass, "border-stone-300")}><svg viewBox="0 0 24 24" className="h-4.5 w-4.5"><path fill="#EA4335" d="M12 5.04c1.9 0 3.6.66 4.95 1.95l3.7-3.7C18.6 1.3 15.5 0 12 0 7.36 0 3.33 2.21 1.29 5.5l4.26 3.3C6.4 6.57 8.9 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45c-.28 1.5-1.12 2.77-2.39 3.62v3h3.83c2.27-2.09 3.6-5.16 3.6-8.65z"/><path fill="#FBBC05" d="M5.55 14.1a6.8 6.8 0 0 1 0-4.2L1.29 6.6A12 12 0 0 0 .28 12c0 1.95.48 3.87 1.34 5.4l4.2-3.3z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.83-3c-1.05.7-2.4 1.12-4.11 1.12-3.1 0-5.6-1.99-6.52-4.7l-4.2 3.3C3.32 21.77 7.36 24 12 24z"/></svg> Continue with Google</button>
                <button type="button" onClick={() => { startLogin(); }} className={cn(socialButtonClass)}><svg viewBox="0 0 24 24" className="h-4.5 w-4.5"><path fill="#000" d="M17.05 12.5c0-1.5.66-2.8 1.73-3.73-1.36-2-.19cf-3.48-4.28-3.48-4.28s-.66.56-1.34 1.56c-.55.82-.94 1.63-1.06 2.48a14.9 14.9 0 0 0-2.88.08c-.12-.85-.5-1.66-1.06-2.48-.68-1-1.34-1.56-1.34-1.56s-2.9 2.28-4.26 4.26c1.07.94 1.73 2.23 1.73 3.73 0 1.5-.66 2.8-1.73 3.72 1.36 1.99 4.28 4.26 4.28 4.26s.67-.55 1.35-1.55c.54-.8.92-1.6 1.05-2.46a15 15 0 0 0 2.9-.1c.13.86.51 1.7 1.05 2.5.68 1 1.35 1.55 1.35 1.55s2.93-2.27 4.29-4.26c-1.08-.94-1.75-2.23-1.75-3.72zM9.5 13.87c-.62 0-1.12-.5-1.12-1.12s.5-1.12 1.12-1.12 1.12.5 1.12 1.12-.5 1.12-1.12 1.12zm3.36 0c-.62 0-1.12-.5-1.12-1.12s.5-1.12 1.12-1.12 1.12.5 1.12 1.12-.5 1.12-1.12 1.12zm-1.68 erta..."/></svg> Continue with Apple</button>
              </div>

              <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                <span className="h-px flex-1 bg-stone-200" /> or <span className="h-px flex-1 bg-stone-200" />
              </div>

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                <div className="relative">
                  <input ref={emailRef} id="auth-email" type="email" autoComplete="email" value={email} onChange={(e)=>{ setEmail(e.target.value); if(errors.email) setErrors((p)=>({...p, email: undefined})); }} className={cn(inputClass, errors.email && "border-rose-400 focus:border-rose-400 focus:ring-rose-400/25")} placeholder=" " aria-invalid={!!errors.email} />
                  <label htmlFor="auth-email" className={labelClass}><Mail className="mr-1 inline h-3 w-3" /> Email</label>
                  {errors.email && <p className={errText}>{errors.email}</p>}
                </div>
                <div className="relative">
                  <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={view === "signup" ? "new-password" : "current-password"} value={password} onChange={(e)=>{ setPassword(e.target.value); if(errors.password) setErrors((p)=>({...p, password: undefined})); }} className={cn(inputClass, "pr-12", errors.password && "border-rose-400 focus:border-rose-400 focus:ring-rose-400/25")} placeholder=" " aria-invalid={!!errors.password} />
                  <label htmlFor="auth-password" className={labelClass}><Lock className="mr-1 inline h-3 w-3" /> Password</label>
                  <button type="button" onClick={()=>setShowPassword((s)=>!s)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">{showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}</button>
                  {errors.password && <p className={errText}>{errors.password}</p>}
                </div>
                <button type="submit" disabled={loading} className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : view === "signup" ? t("createAccount") : t("signIn")}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-stone-500">
                {view === "signup" ? "Already have an account? " : "New to us? "}
                <button type="button" onClick={()=>setView(view === "signup" ? "signin" : "signup")} className="font-bold text-[#2563EB] hover:underline">{view === "signup" ? t("signIn") : t("createAccount")}</button>
              </p>

              <p className="mt-4 text-center text-[10px] leading-relaxed text-stone-400">By continuing you agree to our Terms of Service and Privacy Policy.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
