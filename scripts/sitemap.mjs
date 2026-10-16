/**
 * Deterministic build-time sitemap generator.
 *
 * Replaces `scripts/generate-sitemap.ts` (sitemap index + static/cities
 * sub-sitemaps) with a single `client/public/sitemap.xml` urlset covering the
 * marketing routes (home, city pages, terms, privacy, blog) plus the top
 * published listings (cap 500) — copied to `dist/public` by Vite.
 *
 * Deterministic: a fixed route list in a fixed order and listings ordered by
 * descending `listing_id`; no wall-clock timestamps are emitted (listing
 * `lastmod` comes from the row's own `createdAt`). Listings are read from
 * Postgres when a connection string is available; otherwise the static routes
 * are still written and the listings section is skipped with a warning, so the
 * build can never fail on an unreachable database.
 *
 * Runs from `pnpm build` before `vite build`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildSitemapIndexXml,
  buildStaticSitemap,
  buildCitiesSitemap,
} from "../shared/sitemap.ts";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "client", "public");

const CITY_SLUGS = ["casablanca", "marrakech", "agadir", "rabat", "tangier", "fes"];
const STATIC_PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/search", changefreq: "daily", priority: "0.9" },
  { path: "/properties/for-rent", changefreq: "weekly", priority: "0.8" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/conditions-utilisation", changefreq: "yearly", priority: "0.3" },
  { path: "/politique-confidentialite", changefreq: "yearly", priority: "0.3" },
  { path: "/mentions-legales", changefreq: "yearly", priority: "0.3" },
  { path: "/blog", changefreq: "weekly", priority: "0.6" },
];

function readEnvFile(name) {
  try {
    return readFileSync(resolve(ROOT, name), "utf8");
  } catch {
    return "";
  }
}

function resolveSiteUrl() {
  if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL.replace(/\/+$/, "");
  const combined = [".env", ".env.local", ".env.production.local"].map(readEnvFile).join("\n");
  const match = combined.match(/^VITE_SITE_URL=(.*)$/m);
  const raw = match ? match[1].trim().replace(/^["']|["']$/g, "") : "https://altusplace.ma";
  return raw.replace(/\/+$/, "") || "https://altusplace.ma";
}

function main() {
  const siteUrl = resolveSiteUrl();
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(resolve(PUBLIC_DIR, "sitemap.xml"), buildSitemapIndexXml(siteUrl), "utf8");
  writeFileSync(resolve(PUBLIC_DIR, "sitemap-static.xml"), buildStaticSitemap(siteUrl), "utf8");
  writeFileSync(resolve(PUBLIC_DIR, "sitemap-cities.xml"), buildCitiesSitemap(siteUrl, CITY_SLUGS), "utf8");
  console.log(`[sitemap] wrote sitemap index + sub-sitemaps for ${siteUrl}`);
}

// Only generate when invoked as a script. Importing this module (from a test,
// say) must not write a file as a side effect.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[sitemap] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}