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
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "client", "public");
const MAX_LISTING_URLS = 500;
const PUBLISHED_STATUSES = ["Published", "Available"];

// Mirror of client/src/lib/categories.ts — keep in sync (single source of truth
// for whether a category is a vehicle or a real-estate stay).
const PROPERTY_HINTS =
  /real_estate|property|office|coworking|hotel|شقة|فيلا|مكتب|فندق|villa|apartment|bureau|siège|salle\s*de\s*réunion/i;
const isCarCategory = (category) => (category === "car" || !PROPERTY_HINTS.test(category || ""));

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
  const raw = match ? match[1].trim().replace(/^["']|["']$/g, "") : "https://altusplace.vercel.app";
  return raw.replace(/\/+$/, "") || "https://altusplace.vercel.app";
}

function resolveConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const combined = [".env", ".env.local", ".env.production.local"].map(readEnvFile).join("\n");
  const match = combined.match(/^(?:DATABASE_URL|SUPABASE_DB_URL)=(.*)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

/** Fixed, deterministic route list (matches scripts/prerender.mjs). */
const CITY_SLUGS = ["casablanca", "marrakech", "agadir", "rabat", "tangier", "fes"];
const ROUTES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  ...CITY_SLUGS.map((slug) => ({ path: `/city/${slug}`, changefreq: "weekly", priority: "0.8" })),
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/conditions-utilisation", changefreq: "yearly", priority: "0.3" },
  { path: "/politique-confidentialite", changefreq: "yearly", priority: "0.3" },
  { path: "/mentions-legales", changefreq: "yearly", priority: "0.3" },
  { path: "/blog", changefreq: "weekly", priority: "0.6" },
];

function escapeXml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character],
  );
}

function buildUrlset(entries) {
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

function lastmodOf(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

async function loadPublishedListings() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    console.warn("[sitemap] no DATABASE_URL — publishing static routes only");
    return [];
  }
  let postgres;
  try {
    postgres = require("postgres");
  } catch {
    console.warn("[sitemap] postgres driver unavailable — publishing static routes only");
    return [];
  }
  const sql = postgres(connectionString, { max: 1, connect_timeout: 8, onnotice: () => {} });
  try {
    return await sql`
      select "listing_id" as id, category, "createdAt" as created_at
      from listings
      where status in ${sql(PUBLISHED_STATUSES)}
      order by "listing_id" desc
      limit ${MAX_LISTING_URLS}
    `;
  } catch (error) {
    console.warn(
      `[sitemap] could not load published listings (${error instanceof Error ? error.message : error}) — publishing static routes only`,
    );
    return [];
  } finally {
    await sql.end();
  }
}

async function main() {
  const siteUrl = resolveSiteUrl();
  const entries = ROUTES.map((route) => ({ loc: `${siteUrl}${route.path}`, ...route }));
  const listings = await loadPublishedListings();
  for (const listing of listings) {
    entries.push({
      loc: `${siteUrl}${isCarCategory(listing.category) ? "/car/" : "/property/"}${listing.id}`,
      lastmod: lastmodOf(listing.created_at),
      changefreq: "weekly",
      priority: "0.6",
    });
  }

  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(resolve(PUBLIC_DIR, "sitemap.xml"), buildUrlset(entries), "utf8");
  console.log(
    `[sitemap] wrote ${entries.length} URLs (${listings.length} listings, cap ${MAX_LISTING_URLS}) to client/public/sitemap.xml for ${siteUrl}`,
  );
}

main().catch((error) => {
  console.error(`[sitemap] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});