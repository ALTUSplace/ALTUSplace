/**
 * Lightweight client-side SEO manager.
 *
 * Updates the document title plus description/Open Graph/Twitter meta tags and
 * the canonical link on every route, then (re)renders JSON-LD script blocks so
 * shared listings stay indexable without a server-side rendering step.
 *
 * Single-language-per-URL model: until locale subpaths ship (see
 * docs/SEO_PLAN.md, Phase 1) each URL is canonical to itself and exposes a
 * single `x-default` alternate. We intentionally never emit `hreflang` for
 * `/ar`, `/fr` or `/en` because those routes do not exist yet.
 */

type SeoLanguage = "ar" | "fr" | "en";

function readEnvSiteUrl(): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return env?.VITE_SITE_URL;
  } catch {
    return undefined;
  }
}

export const SITE_URL = (readEnvSiteUrl() || "https://altusplace.vercel.app").replace(/\/+$/, "");

/** @deprecated Use `SITE_URL`. Kept for existing imports. */
export const BASE_URL = SITE_URL;

const OPEN_GRAPH_LOCALES: Record<SeoLanguage, string> = {
  ar: "ar_MA",
  fr: "fr_MA",
  en: "en_GB",
};

/** Normalizes a route path into an absolute canonical URL (no query/hash). */
export function canonicalUrl(path = "/"): string {
  const withoutQuery = (path || "/").split(/[?#]/)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const trimmed = withLeadingSlash === "/" ? "/" : withLeadingSlash.replace(/\/+$/, "");
  return `${SITE_URL}${trimmed}`;
}

function toAbsoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  if (typeof document === "undefined" || !content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string, hreflang?: string): void {
  if (typeof document === "undefined") return;
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Keeps canonical + localized alternates pointing at the same resource so the
 * language toggle does not fragment search ranking. Emits `x-default` only;
 * per-locale `hreflang` entries are deferred to the locale-subpath phase.
 */
export function applyLocales(language: SeoLanguage = "ar", path = "/"): void {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]:not([hreflang="x-default"])')
    .forEach((node) => node.remove());
  const canonical = canonicalUrl(path);
  upsertLink("canonical", canonical);
  upsertLink("alternate", canonical, "x-default");
  upsertMeta("property", "og:locale", OPEN_GRAPH_LOCALES[language] ?? OPEN_GRAPH_LOCALES.ar);
}

export type SeoInput = {
  title: string;
  description: string;
  path?: string;
  language?: SeoLanguage;
  /** Absolute or root-relative social image. */
  image?: string;
  /** Open Graph type, e.g. "website" | "product" | "article" | "place". */
  type?: string;
  /** Full robots directive, e.g. "noindex, follow". */
  robots?: string;
  /** Override the canonical path when the visible URL contains filters. */
  canonicalPath?: string;
};

const DEFAULT_ROBOTS = "index, follow, max-image-preview:large";

/** Set the page title + description and mirror them into social cards. */
export function useSEO({
  title,
  description,
  path,
  language = "ar",
  image,
  type = "website",
  robots = DEFAULT_ROBOTS,
  canonicalPath,
}: SeoInput): void {
  if (typeof document === "undefined") return;

  const resolvedPath = canonicalPath ?? path ?? "/";
  const url = canonicalUrl(resolvedPath);

  document.title = title;
  upsertMeta("name", "description", description);
  upsertMeta("property", "og:type", type);
  upsertMeta("property", "og:site_name", "ALTUSplace");
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:url", url);
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);

  if (image) {
    const absoluteImage = toAbsoluteUrl(image);
    upsertMeta("property", "og:image", absoluteImage);
    upsertMeta("name", "twitter:image", absoluteImage);
    upsertMeta("name", "twitter:card", "summary_large_image");
  } else {
    upsertMeta("name", "twitter:card", "summary");
  }

  upsertMeta("name", "robots", robots);
  applyLocales(language, resolvedPath);
}

type JsonLdEntry = { "@context": string } & Record<string, unknown>;

/**
 * (Re)mounts a JSON-LD script given a stable id. Call from component effects
 * once data is available (listings, blog articles, breadcrumbs).
 */
export function renderJsonLd<T extends JsonLdEntry>(id: string, entry: T): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = id;
  script.textContent = JSON.stringify(entry);
  document.head.appendChild(script);
}

/**
 * Marks a page as private for search engines. Used on auth funnels and
 * dashboard areas that must never be indexed.
 */
export function useNoIndex(): void {
  if (typeof document === "undefined") return;
  upsertMeta("name", "robots", "noindex, follow");
  upsertMeta("property", "og:robots", "noindex, follow");
}
