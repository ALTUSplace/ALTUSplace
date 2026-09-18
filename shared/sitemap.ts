/**
 * Pure sitemap builders shared by the build-time generator
 * (`scripts/generate-sitemap.ts`) and the runtime API routes
 * (`server/_core/sitemap.ts`). Keep this module dependency-free so it can be
 * imported from both a Node build script and the serverless bundle.
 */

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
};

export const STATIC_SITEMAP_PATH = "/sitemap-static.xml";
export const CITIES_SITEMAP_PATH = "/sitemap-cities.xml";
export const LISTINGS_SITEMAP_PATH = "/api/sitemap-listings.xml";
export const COMPANIES_SITEMAP_PATH = "/api/sitemap-companies.xml";

/** Public, canonical, 200-status pages that are not city/entity pages. */
export const STATIC_PAGES: ReadonlyArray<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/search", changefreq: "daily", priority: "0.9" },
  { path: "/locations", changefreq: "weekly", priority: "0.8" },
  { path: "/blog", changefreq: "weekly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/support-tickets", changefreq: "monthly", priority: "0.4" },
  { path: "/dispute-resolution", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
];

/** Hand-maintained landing pages with their own copy. */
export const BESPOKE_LOCATION_PAGES: readonly string[] = [
  "/locations/marrakech-car-rental",
  "/locations/mohammed-v-airport-car-rental",
];

export function escapeXml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] as string,
  );
}

export function buildUrlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      if (entry.changefreq) lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`);
      if (entry.priority) lines.push(`    <priority>${escapeXml(entry.priority)}</priority>`);
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildSitemapIndex(sitemapUrls: string[]): string {
  const entries = sitemapUrls
    .map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

export function buildStaticSitemap(siteUrl: string, lastmod?: string): string {
  const base = normalizeSiteUrl(siteUrl);
  return buildUrlset(
    STATIC_PAGES.map((page) => ({
      loc: `${base}${page.path}`,
      lastmod,
      changefreq: page.changefreq,
      priority: page.priority,
    })),
  );
}

export function buildCitiesSitemap(siteUrl: string, citySlugs: string[], lastmod?: string): string {
  const base = normalizeSiteUrl(siteUrl);
  const paths = [...BESPOKE_LOCATION_PAGES, ...citySlugs.map((slug) => `/locations/${slug}`)];
  return buildUrlset(
    paths.map((path) => ({
      loc: `${base}${path}`,
      lastmod,
      changefreq: "weekly",
      priority: "0.7",
    })),
  );
}

export function buildSitemapIndexXml(siteUrl: string): string {
  const base = normalizeSiteUrl(siteUrl);
  return buildSitemapIndex([
    `${base}${STATIC_SITEMAP_PATH}`,
    `${base}${CITIES_SITEMAP_PATH}`,
    `${base}${LISTINGS_SITEMAP_PATH}`,
    `${base}${COMPANIES_SITEMAP_PATH}`,
  ]);
}
