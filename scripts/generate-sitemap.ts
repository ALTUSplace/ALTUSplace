/**
 * Build-time sitemap generator.
 *
 * Writes the static sitemap index plus its two static sub-sitemaps into
 * `client/public` (copied to `dist/public` by Vite). The listings and companies
 * sub-sitemaps are generated at runtime from the database and are referenced by
 * the index but not written here.
 *
 * Runs from `pnpm build` before `vite build`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MOROCCO_CITY_SLUGS } from "../client/src/data/moroccoCities";
import {
  CITIES_SITEMAP_PATH,
  STATIC_SITEMAP_PATH,
  buildCitiesSitemap,
  buildSitemapIndexXml,
  buildStaticSitemap,
  normalizeSiteUrl,
} from "../shared/sitemap";

const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL || "https://altusplace.ma");
const publicDir = resolve(import.meta.dirname, "..", "client", "public");
const lastmod = new Date().toISOString().slice(0, 10);
const citySlugs = Object.values(MOROCCO_CITY_SLUGS);

mkdirSync(publicDir, { recursive: true });
writeFileSync(resolve(publicDir, "sitemap.xml"), buildSitemapIndexXml(siteUrl), "utf8");
writeFileSync(resolve(publicDir, STATIC_SITEMAP_PATH.replace(/^\//, "")), buildStaticSitemap(siteUrl, lastmod), "utf8");
writeFileSync(resolve(publicDir, CITIES_SITEMAP_PATH.replace(/^\//, "")), buildCitiesSitemap(siteUrl, citySlugs, lastmod), "utf8");

console.log(`[seo] generated sitemap index + static + ${citySlugs.length} city URLs for ${siteUrl}`);
