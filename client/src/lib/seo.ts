/**
 * Lightweight client-side SEO manager.
 *
 * Updates the document title plus description/OG/Twitter meta tags on every
 * route and re-renders the JSON-LD script blocks so shared listings stay
 * indexable without a server-side rendering step.
 */

const BASE_URL = "https://altusplace.vercel.app";

const SEO_META_MAP: Record<string, { selector: string; attr: string }> = {
  description: { selector: 'meta[name="description"]', attr: "content" },
  "og:title": { selector: 'meta[property="og:title"]', attr: "content" },
  "og:description": { selector: 'meta[property="og:description"]', attr: "content" },
  "og:url": { selector: 'meta[property="og:url"]', attr: "content" },
  "twitter:title": { selector: 'meta[name="twitter:title"]', attr: "content" },
  "twitter:description": { selector: 'meta[name="twitter:description"]', attr: "content" },
};

function setMetaTag(name: string, value: string): void {
  const config = SEO_META_MAP[name];
  if (!config) return;
  let el = document.querySelector<HTMLMetaElement>(config.selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(config.attr === "content" && name.startsWith("og:") ? "property" : "name", name);
    document.head.appendChild(el);
  }
  el.setAttribute(config.attr, value);
}

function setLinkRel(rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Keeps canonical + localized alternates pointing at the same resource so the
 * French/Arabic routes do not fragment search ranking.
 */
export function applyLocales(pathLang: "ar" | "fr" | "en", path = "/"): void {
  setLinkRel("canonical", `${BASE_URL}${path}`);
  setLinkRel("alternate", `${BASE_URL}/en`);
  setLinkRel("alternate", `${BASE_URL}/ar`);
  setLinkRel("alternate", `${BASE_URL}/fr`);
  const el = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]')).find((node) => node.hreflang === "x-default");
  if (el) el.href = `${BASE_URL}/`;
  void pathLang;
}

export type SeoInput = {
  title: string;
  description: string;
  path?: string;
  language?: "ar" | "fr" | "en";
};

/** Set the page title + description and mirror them into social cards. */
export function useSEO({ title, description, path, language = "ar" }: SeoInput): void {
  if (typeof document === "undefined") return;
  document.title = title;
  setMetaTag("description", description);
  setMetaTag("og:title", title);
  setMetaTag("og:description", description);
  setMetaTag("og:url", `${BASE_URL}${path ?? "/"}`);
  setMetaTag("twitter:title", title);
  setMetaTag("twitter:description", description);
  applyLocales(language, path ?? "/");
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

export { BASE_URL };