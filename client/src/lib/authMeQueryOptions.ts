/**
 * Shared tRPC query options for `auth.me` (audit finding C5).
 *
 * The session probe used to be re-fetched on EVERY component mount: the
 * default `staleTime` is 0, so every route change, every navbar render and
 * every dashboard widget fired `POST/GET /api/trpc/auth.me`. In the audit load
 * test that produced 180/180 `429`s — and because `auth.me` shared the strict
 * 5/min bucket with login, a page refresh could lock the user out of their own
 * session while a brute-forcer got the same budget.
 *
 * Policy: read the session ONCE and cache it; refetch only on an explicit
 * action (logout / profile save / `useAuth().refresh()`) or after `staleTime`.
 *
 *  - `refetchOnMount: false` — remounts reuse the cache. A mount with NO
 *    cached value still fetches (`shouldLoadOnMount` in @tanstack/query-core
 *    only checks `data === undefined`), so the very first load is unaffected.
 *  - `staleTime: 5min` — bounds how old a cached session may get for the
 *    other refetch triggers (reconnect, explicit refetch).
 *  - `gcTime: 30min` — keeps the cache alive across a SPA session instead of
 *    dropping it 5 minutes after the last observer unmounts.
 *  - `refetchOnWindowFocus: false` / `retry: false` — a session check must
 *    never hammer or block on a slow gateway.
 *
 * Server side, `auth.me` is bucketed as `session-read` (300/min, its own
 * bucket) by `classifyApiRequest` in server/_core/security.ts — it can never
 * spend the login budget.
 */
export const AUTH_ME_QUERY_OPTIONS = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
};
