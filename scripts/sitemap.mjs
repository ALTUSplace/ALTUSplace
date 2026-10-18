/**
 * Deterministic build-time sitemap generator.
 *
 * Writes a sitemap index (`sitemap.xml`) plus two static sub-sitemaps
 * (`sitemap-static.xml`, `sitemap-cities.xml`) into `client/public`, copied to
 * `dist/public` by Vite. Dynamic listings/companies sub-sitemaps are served at
 * runtime by `server/_core/sitemap.ts` (`/api/sitemap-*.xml`).
 *
 * Deterministic: a fixed route list in a fixed order, and no `lastmod` is
 * emitted (no wall-clock timestamps), so the output is byte-stable across
 * runs. No database connection is required — the static and cities
 * sub-sitemaps are pure, so the build can never fail on an unreachable DB.
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