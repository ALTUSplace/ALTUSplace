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

export default function DirectLogin() {
  const { direction } = useLanguage();
  const [mode, setMode] = useState<Mode>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/owner-status", { credentials: "include" })
      .then(async (response) => {
        if (cancelled) return;
        const data = await readJson(response);
        if (!data) {
          setMode("unavailable");
          setError("The API is not reachable on this deployment (it returned a web page instead of JSON).");
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
        setError("Choose a password with at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("The two passwords do not match.");
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
        setError("The API is not reachable on this deployment (it returned a web page instead of JSON).");
        return;
      }
      if (response.ok) {
        window.location.href = payload.redirectTo || "/admin/super/dashboard";
        return;
      }
      const reason = payload.reason;
      if (reason === "already_configured") {
        setMode("login");
        setError("This owner login has already been set up. Please sign in.");
      } else if (response.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (reason === "weak_password") {
        setError("Choose a password with at least 8 characters.");
      } else if (reason === "missing_password") {
        setError("The server did not receive the password. Please try again.");
      } else if (reason === "server_error") {
        setError("Server error. Check the Vercel function logs for [DirectAuth].");
      } else if (reason === "not_configured") {
        setMode("setup");
        setError("No owner password is set yet. Choose one to claim this account.");
      } else if (reason === "password_mismatch") {
        setError("Incorrect password. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
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
            <span>ALTUSplace — Platform Owner</span>
          </div>
          <h1 className="text-2xl font-black text-slate-950">{isSetup ? "Set up owner login" : "Direct login"}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {isSetup
              ? "No owner password is set yet. Choose one now to claim the platform-owner account. It is stored only in the database — never in the repository — and can be set just once here."
              : "Fallback access for the platform owner when the external OAuth portal is unavailable."}
          </p>

          {mode === "loading" ? (
            <p className="mt-6 text-sm font-semibold text-slate-500">Checking owner login status…</p>
          ) : mode === "unavailable" ? (
            error ? null : (
              <p className="mt-6 text-sm font-semibold text-slate-500">
                Could not reach the server. Please refresh the page and try again.
              </p>
            )
          ) : (
            <>
              <label htmlFor="direct-password" className="mt-6 block text-sm font-semibold text-slate-800">
                {isSetup ? "New owner password" : "Owner password"}
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
                    Confirm password
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
            <Button type="submit" disabled={!canSubmit || loading} className="mt-5 w-full gap-2 bg-[#15120D] text-white hover:bg-accent-clay-hover">
              <KeyRound className="h-4 w-4" />
              {loading ? (isSetup ? "Setting up…" : "Signing in…") : isSetup ? "Set password & sign in" : "Sign in"}
            </Button>
          ) : null}
        </form>

        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#15120D] hover:text-amber-700">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </section>
    </main>
  );
}
