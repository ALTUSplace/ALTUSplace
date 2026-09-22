import { COOKIE_NAME } from "@shared/const";

export const trpcApiUrl =
  (import.meta.env.VITE_API_URL as string | undefined) || "/api/trpc";

/**
 * Preview auto-login fallback: when the browser blocks iframe cookies
 * (Safari ITP / private browsing / WebView), the runtime mirrors the
 * session into sessionStorage so we can forward it as a Bearer token.
 * The regular OAuth cookie flow keeps working and takes priority server-side.
 */
export function trpcHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    if (raw) {
      const prefix = `${COOKIE_NAME}=`;
      const pair = raw.split(";").find((s) => s.trim().startsWith(prefix));
      const token = pair?.trim().slice(prefix.length);
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // sessionStorage unavailable
  }
  return {};
}

export function trpcFetch(input: RequestInfo | URL, init?: RequestInit) {
  return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
}