export const trpcApiUrl =
  (import.meta.env.VITE_API_URL as string | undefined) || "/api/trpc";

// No Authorization header is ever set from JS. The session lives in the
// HttpOnly `app_session_id` cookie and reaches the API through
// `credentials: "include"` alone, so no script in this origin can read it.
// (A previous sessionStorage -> Bearer fallback was removed: nothing ever
// wrote that key, and mirroring the cookie into JS-reachable storage made the
// session token exfiltratable by any injected script.)
export function trpcFetch(input: RequestInfo | URL, init?: RequestInit) {
  return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
}