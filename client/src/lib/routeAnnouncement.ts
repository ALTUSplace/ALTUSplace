/**
 * Pure helpers backing the SPA route announcer.
 *
 * Route announcements and focus management are what make client-side routing
 * usable without sight: assistive tech gets no "document changed" signal from a
 * pushState, so the app has to say the new page's name out loud and move focus
 * to it (WCAG 2.4.3 Focus Order, 4.1.3 Status Messages).
 *
 * Everything in this module is deliberately DOM-free. The repo's vitest config
 * runs `environment: "node"` (see vitest.config.ts) and neither jsdom nor
 * @testing-library is installed, so the parts worth unit testing are kept pure
 * and the DOM reads live in hooks/useRouteAnnouncer.ts.
 */

/** Beyond this a live region stops being useful and starts being noise. */
export const MAX_ANNOUNCEMENT_LENGTH = 160;

/**
 * Separator glyphs that page headings routinely carry inline (lucide icons,
 * `Title — Subtitle`, `A | B`). Screen readers vocalise several of these as
 * "dash" / "vertical line", so they are folded to spaces before announcing.
 *
 * U+2010-U+2016 covers the hyphen through the double vertical line — the range
 * has to include U+2014 EM DASH specifically, which is what Arabic copy in this
 * codebase actually uses. U+2212 is the typographic minus.
 */
const DECORATIVE_SEPARATORS = /[\u2010-\u2016\u2212\u00b7\u2022\u00a7|]/g;

/**
 * Normalises candidate announcement text.
 *
 * Returns "" for anything unusable — an empty string reaching a live region is
 * not merely silent, it can clear a pending announcement in some screen-reader
 * / browser pairings, so callers must treat "" as "nothing to say".
 */
export function normalizeAnnouncement(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(DECORATIVE_SEPARATORS, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= MAX_ANNOUNCEMENT_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_ANNOUNCEMENT_LENGTH - 1).trimEnd()}\u2026`;
}

/**
 * Extracts the page name from a document title.
 *
 * `useSEO` (client/src/lib/seo.ts) writes titles as
 * "إتمام الحجز والدفع | ALTUSplace". Announcing the raw title would repeat the
 * brand on every single navigation, which tells a screen-reader user nothing
 * about the page they just landed on.
 */
export function pageNameFromTitle(title: string | null | undefined): string {
  if (!title) return "";
  const [pageName] = title.split(/\s+[|\u00b7\u2013\u2014-]\s+/);
  return normalizeAnnouncement(pageName ?? title);
}

/**
 * Reduces a path to a comparable form: no query, no hash, no trailing slash.
 *
 * wouter's `useLocation()` already reports the bare pathname, so query-string
 * filter changes on /search never reach the announcer at all. This still earns
 * its place for trailing-slash variants: navigating `/about` -> `/about/` is a
 * real string change but not a real page change, and re-announcing it would be
 * a phantom page change.
 */
export function toComparablePath(path: string): string {
  const withoutHash = path.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  // The `|| "/"` matters: stripping trailing slashes off "//" leaves "", which
  // would then look like a *different* route from "/" and trigger a phantom
  // page change.
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}