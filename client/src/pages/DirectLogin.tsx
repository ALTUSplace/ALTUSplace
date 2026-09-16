import { useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DirectLogin() {
  const { direction } = useLanguage();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/direct-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        const data = (await response.json()) as { redirectTo?: string };
        window.location.href = data.redirectTo || "/admin/super/dashboard";
        return;
      }
      if (response.status === 404) {
        setError("Direct login is disabled. Set DIRECT_LOGIN_PASSWORD in your environment and redeploy.");
      } else if (response.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:px-6" dir={direction}>
      <section className="mx-auto max-w-md">
        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
            <ShieldCheck className="h-5 w-5" />
            <span>ALTUSplace — Platform Owner</span>
          </div>
          <h1 className="text-2xl font-black text-slate-950">Direct login</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Fallback access for the platform owner when the external OAuth portal is unavailable.
          </p>

          <label htmlFor="direct-password" className="mt-6 block text-sm font-semibold text-slate-800">
            Owner password
          </label>
          <input
            id="direct-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            placeholder="••••••••"
          />

          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={!password || loading} className="mt-5 w-full gap-2 bg-[#15120D] text-white hover:bg-accent-clay-hover">
            <KeyRound className="h-4 w-4" />
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#15120D] hover:text-amber-700">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </section>
    </main>
  );
}