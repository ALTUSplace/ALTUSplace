/**
 * SPA route classifier — shared by the Vercel edge middleware and the Node
 * prerenderer.
 *
 * The SPA shell used to be served for EVERY non-file URL (soft-200), so
 * undeclared URLs like `/foo/bar` were indexable 200s and Google filed them as
 * soft-404s. This module answers the question "does the client router declare
 * this URL?" once, in one dependency-free place: `middleware.ts` (Vercel edge
 * runtime — no Node built-ins allowed here) and `server/_core/prerender.ts`
 * (Node) both consume it, so an unknown URL gets a real 404 and `noindex`
 * everywhere.
 *
 * The catalog mirrors `client/src/App.tsx` (`<Route path>`). A guard test
 * (`server/spa-paths.guard.test.ts`) re-reads App.tsx and fails the build if the
 * router and this classifier ever drift in either direction.
 *
 * MUST stay free of imports and Node runtime APIs (it is bundled into Vercel's
 * edge worker).
 */

export type SpaPathKind = "known" | "unknown";

/** Every static `<Route path>`, exactly as declared in client/src/App.tsx. */
export const SPA_STATIC_ROUTES: readonly string[] = [
  "/",
  "/search",
  "/properties/for-rent",
  "/locations/marrakech-car-rental",
  "/locations/mohammed-v-airport-car-rental",
  "/locations",
  "/booking",
  "/success",
  "/dashboard",
  "/admin",
  "/admin/moderation",
  "/admin/super",
  "/admin/super/dashboard",
  "/dispute-resolution",
  "/terms",
  "/conditions-utilisation",
  "/politique-confidentialite",
  "/mentions-legales",
  "/register",
  "/owner-login",
  "/become-partner",
  "/become-partner/car-rental",
  "/become-partner/real-estate",
  "/become-agency",
  "/agency/register",
  "/privacy",
  "/host",
  "/host-dashboard",
  "/agency-dashboard",
  "/host/settings",
  "/partner",
  "/partner-dashboard",
  "/add-car",
  "/my-bookings",
  "/profile",
  "/checkout",
  "/kyc",
  "/help",
  "/support-tickets",
  "/notifications",
  "/favorites",
  "/about",
  "/blog",
];

/**
 * Parameterised `<Route path>`s, collapsed by shape:
 *   /property/:id, /car/:id            -> one pattern (id == integer, but the
 *                                        router matches any non-empty segment
 *                                        and NotFound handles non-integers)
 *   /locations/:slug, /city/:slug      -> two patterns (distinct URL spaces)
 *   /voucher/:code, /messages/:bookingId -> one each
 * A parameterised route is only "known" when the URL actually carries the
 * parameter segment.
 */
export const SPA_DYNAMIC_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/(?:car|property)\/[^/?#]+$/,
  /^\/locations\/[^/?#]+$/,
  /^\/city\/[^/?#]+$/,
  /^\/voucher\/[^/?#]+$/,
  /^\/messages\/[^/?#]+$/,
];

/** Strip query/fragment and any trailing slash (mirrors React Router matching). */
export function normalizeSpaPath(pathname: string): string {
  const clean = (pathname || "/").split(/[?#]/)[0] || "/";
  if (clean === "/") return "/";
  return clean.replace(/\/+$/, "") || "/";
}

export function classifySpaPath(pathname: string): SpaPathKind {
  const normalized = normalizeSpaPath(pathname);
  if (SPA_STATIC_ROUTES.includes(normalized)) return "known";
  for (const pattern of SPA_DYNAMIC_ROUTE_PATTERNS) {
    if (pattern.test(normalized)) return "known";
  }
  return "unknown";
}