// ── Single source of truth for the Content-Security-Policy ───────────────────
// Consumed by the Express middleware (server/_core/security.ts) and enforced at
// the edge via vercel.json ("/(.*)" headers). Keep the vercel.json copy
// byte-identical: server/cspParity.test.ts fails if the two ever drift.
//
// Notes:
// - Google Fonts origins are allowed for style/font/connect so the bundled
//   font loading keeps working without 'unsafe-inline' style bloat.
// - images.unsplash.com is in connect-src (not only img-src) so the
//   <link rel="preconnect"> in client/index.html survives the policy check
//   resource hints go through. Blog and demo/seed listing photos come from
//   Unsplash's resizing endpoint and are the first subresource the SPA asks
//   for, so the hint is what keeps DNS + TLS off the image critical path.
// - The sha256 hash covers the single inline anti-FOUC theme script that Vite
//   injects verbatim into dist/public/index.html. The hash is computed over the
//   CRLF-normalized (LF) script text: although the checked-out file may contain
//   CRLF line endings on Windows (core.autocrlf), browsers always normalize
//   CRLF -> LF before hashing inline scripts, so the LF hash is the effective
//   allowlist value in every environment.
// - worker-src 'self' blob: is required by Mapbox GL.
export const CSP_HEADER_VALUE =
  "default-src 'self'; " +
  "script-src 'self' 'sha256-xYOUwcupjZMs56nCJt01V1G/vc1s/M/uyM9UOrKQxKE='; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "img-src 'self' data: blob: https:; " +
  "connect-src 'self' https://images.unsplash.com https://api.mapbox.com https://events.mapbox.com https://*.mapbox.com https://*.supabase.co https://graph.facebook.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
  "font-src 'self' data: https://fonts.gstatic.com; " +
  "worker-src 'self' blob:; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "upgrade-insecure-requests";